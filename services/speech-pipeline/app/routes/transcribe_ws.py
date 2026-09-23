"""WebSocket transcript streaming endpoint (Blueprint Section 3.2 steps 1-9):
audio in -> Hindi transcript -> English translation -> back-translation +
miscommunication check + confidence v2 -> TTS audio -> speaker label, all
pushed back over the same connection.

Router is built via a factory so every provider is injectable -- tests pass
fixtures, app/main.py passes the real (lazy) providers. This keeps each
model swappable without touching routing/session logic
(AGENT_INSTRUCTIONS.md Section 3.1 abstraction rule).
"""

from __future__ import annotations

import logging
import uuid
from typing import Callable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.asr.provider import ASRProvider
from app.asr.schemas import TranscriptEvent
from app.asr.session import StreamingASRSession
from app.clinical_nlp.provider import EmergencyDetector, EntityExtractor, MiscommunicationChecker, RiskScorer
from app.clinical_nlp.schemas import RiskLevel
from app.confidence.scoring import compute_confidence_v2, confidence_band
from app.diarization.diarizer import SpeakerDiarizer
from app.diarization.provider import SpeakerEmbeddingProvider
from app.emotion.provider import EmotionClassifier
from app.mt.provider import MTProvider
from app.orchestrator_client import OrchestratorClient, TimelineEventType
from app.tts.provider import TTSProvider

logger = logging.getLogger(__name__)

MTProviderGetter = Callable[[], MTProvider]
TTSProviderGetter = Callable[[], TTSProvider]
EmbeddingProviderGetter = Callable[[], SpeakerEmbeddingProvider]
MiscommunicationCheckerGetter = Callable[[], MiscommunicationChecker]
OrchestratorClientGetter = Callable[[], OrchestratorClient]
EntityExtractorGetter = Callable[[], EntityExtractor]
EmergencyDetectorGetter = Callable[[], EmergencyDetector]
EmotionClassifierGetter = Callable[[], EmotionClassifier]
RiskScorerGetter = Callable[[], RiskScorer]


def create_transcribe_router(
    get_provider: Callable[[], ASRProvider],
    get_mt_provider: MTProviderGetter | None = None,
    get_tts_provider: TTSProviderGetter | None = None,
    get_embedding_provider: EmbeddingProviderGetter | None = None,
    get_miscommunication_checker: MiscommunicationCheckerGetter | None = None,
    get_orchestrator_client: OrchestratorClientGetter | None = None,
    get_entity_extractor: EntityExtractorGetter | None = None,
    get_emergency_detector: EmergencyDetectorGetter | None = None,
    get_emotion_classifier: EmotionClassifierGetter | None = None,
    get_risk_scorer: RiskScorerGetter | None = None,
) -> APIRouter:
    router = APIRouter()

    @router.websocket("/ws/transcribe")
    async def transcribe_ws(websocket: WebSocket) -> None:
        await websocket.accept()

        # One conversation-memory session per connection (Blueprint Section
        # 2.2), sent on every event so the client can query orchestrator's
        # memory API. Not tied to any auth/patient identity yet -- Phase 9
        # (RBAC) is where a real session identity gets threaded through.
        session_id = uuid.uuid4().hex

        import asyncio

        loop = asyncio.get_event_loop()
        try:
            provider = await loop.run_in_executor(None, get_provider)
        except RuntimeError as exc:
            # Fail loud, not silent (Blueprint Section 1 Principle 3): tell
            # the client ASR is unavailable instead of accepting audio that
            # will never produce a transcript.
            await websocket.send_json(
                TranscriptEvent(
                    type="error", utterance_id="n/a", session_id=session_id, error=str(exc)
                ).model_dump()
            )
            await websocket.close(code=1011)
            return

        session = StreamingASRSession(provider)
        # One diarizer per connection: clustering state (who's "speaker_a"
        # vs "speaker_b") must not leak across sessions/patients. Built
        # eagerly (not lazily inside the enrichment call) so a persistently
        # broken embedding model degrades once per connection, not silently
        # retries on every utterance.
        diarizer: SpeakerDiarizer | None = None
        diarizer_error: str | None = None
        if get_embedding_provider is not None:
            try:
                diarizer = SpeakerDiarizer(await loop.run_in_executor(None, get_embedding_provider))
            except Exception as exc:  # noqa: BLE001 - degrade, don't crash the session
                logger.exception("diarization unavailable for this session")
                diarizer_error = str(exc)

        import asyncio as _asyncio
        _loop = _asyncio.get_event_loop()
        _send_queue: _asyncio.Queue[TranscriptEvent | None] = _asyncio.Queue()

        async def _reader() -> None:
            """Reads audio chunks continuously so the TCP buffer never stalls."""
            chunks_received = 0
            bytes_received = 0
            try:
                while True:
                    chunk = await websocket.receive_bytes()
                    chunks_received += 1
                    bytes_received += len(chunk)
                    if chunks_received == 1 or chunks_received % 100 == 0:
                        logger.info(
                            "session %s: received %d audio chunks (%d bytes)",
                            session_id[:8],
                            chunks_received,
                            bytes_received,
                        )
                    try:
                        events = await _loop.run_in_executor(None, session.push_chunk, chunk)
                    except Exception:
                        logger.exception("push_chunk failed, continuing")
                        continue
                    for ev in events:
                        await _send_queue.put(ev)
            except WebSocketDisconnect:
                pass
            except RuntimeError as exc:
                if "not connected" in str(exc).lower():
                    logger.info("session %s: client disconnected", session_id[:8])
                else:
                    logger.exception("_reader task encountered error: %s", exc)
            except Exception:
                logger.exception("_reader task died unexpectedly")
            finally:
                logger.info(
                    "session %s: audio reader ended (total %d chunks, %d bytes)",
                    session_id[:8],
                    chunks_received,
                    bytes_received,
                )
                await _send_queue.put(None)  # sentinel

        _asyncio.create_task(_reader())

        last_risk_level: RiskLevel | None = None
        try:
            while True:
                raw_event = await _send_queue.get()
                if raw_event is None:
                    break
                event = raw_event.model_copy(update={"session_id": session_id})
                event = await _enrich_final_event(
                    event,
                    get_mt_provider,
                    get_tts_provider,
                    get_miscommunication_checker,
                    get_entity_extractor,
                    get_emergency_detector,
                    get_emotion_classifier,
                    get_risk_scorer,
                    session,
                    diarizer,
                    diarizer_error,
                )
                await websocket.send_json(event.model_dump())
                await _record_utterance(event, session_id, get_orchestrator_client)
                last_risk_level = await _record_timeline_events(
                    event, session_id, get_orchestrator_client, last_risk_level
                )
        except WebSocketDisconnect:
            for event in session.flush():
                # Nothing to send to a disconnected client; this exercises
                # the same finalize path so no in-progress utterance is
                # silently dropped, and gives orchestrator/audit a hook
                # point once that integration lands (Phase 4+).
                logger.info(
                    "session flushed on disconnect: utterance=%s type=%s",
                    event.utterance_id,
                    event.type,
                )

    return router


async def _enrich_final_event(
    event: TranscriptEvent,
    get_mt_provider: MTProviderGetter | None,
    get_tts_provider: TTSProviderGetter | None,
    get_miscommunication_checker: MiscommunicationCheckerGetter | None,
    get_entity_extractor: EntityExtractorGetter | None,
    get_emergency_detector: EmergencyDetectorGetter | None,
    get_emotion_classifier: EmotionClassifierGetter | None,
    get_risk_scorer: RiskScorerGetter | None,
    session: StreamingASRSession,
    diarizer: SpeakerDiarizer | None,
    diarizer_error: str | None,
) -> TranscriptEvent:
    """Runs emergency detection, MT, back-translation + miscommunication
    check + confidence v2, TTS, diarization, entity extraction, emotion
    classification, then risk scoring on a finalized ASR event. Partials
    are left alone -- translating/diarizing/extracting/scoring unstable
    text wastes compute and would flicker on screen.

    Emergency detection runs FIRST, before translation or anything else
    (Blueprint Section 3.2 step 10: "Emergency keyword hits short-circuit
    the pipeline: alert is pushed immediately on keyword match, before
    waiting on the full NLP pass, to minimize latency for critical
    alerts") -- it's on the Hindi original, needs nothing else in this
    chain to have run yet, and every stage after it independently degrades
    without affecting it either way.

    Emotion classification runs on this utterance's own audio (local, no
    HTTP call) once diarization has already pulled it from the session
    buffer. Risk scoring runs last among Phase 6 additions since it
    composes the emergency result and the emotion signal computed above.

    Each stage's failure is independent and never drops what earlier stages
    already computed: the client always has at least the raw Hindi text +
    ASR confidence even in fully degraded mode (Blueprint Section 7.2).
    """
    if event.type != "final" or event.segment is None or not event.segment.text.strip():
        return event

    import asyncio as _asyncio
    _loop = _asyncio.get_event_loop()

    event = await _run_emergency_detection(event, get_emergency_detector)
    event = await _loop.run_in_executor(None, _run_translation, event, get_mt_provider)
    event = await _loop.run_in_executor(None, _run_back_translation, event, get_mt_provider)
    event = await _run_miscommunication_check(event, get_miscommunication_checker)
    event = await _loop.run_in_executor(None, _run_tts, event, get_tts_provider)
    event = await _loop.run_in_executor(None, _run_diarization, event, session, diarizer, diarizer_error)
    event = await _run_entity_extraction(event, get_entity_extractor)
    event = await _loop.run_in_executor(None, _run_emotion_classification, event, session, get_emotion_classifier)
    event = await _run_risk_scoring(event, get_risk_scorer)
    return event


def _run_translation(event: TranscriptEvent, get_mt_provider: MTProviderGetter | None) -> TranscriptEvent:
    if get_mt_provider is None:
        return event
    try:
        segment = event.segment
        assert segment is not None
        if not segment.text.strip():
            return event
        target_lang = "hi" if segment.language == "en" else "en"
        translation = get_mt_provider().translate(segment.text, segment.language, target_lang)
        return event.model_copy(update={"translation": translation})
    except Exception as exc:  # noqa: BLE001 - any MT failure degrades, never crashes the session
        logger.exception("translation failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"translation_error": str(exc)})


def _run_back_translation(event: TranscriptEvent, get_mt_provider: MTProviderGetter | None) -> TranscriptEvent:
    """EN -> HI (or HI -> EN), the reverse leg of Blueprint Section 3.2 step 6's
    back-translation consistency check. Only runs when the forward
    translation succeeded -- there's nothing to translate back otherwise."""
    if get_mt_provider is None or event.translation is None:
        return event
    try:
        if not event.translation.text.strip():
            return event
        back_translation = get_mt_provider().translate(
            event.translation.text, event.translation.target_language, event.translation.source_language
        )
        return event.model_copy(update={"back_translation": back_translation})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("back-translation failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"back_translation_error": str(exc)})


async def _run_miscommunication_check(
    event: TranscriptEvent, get_miscommunication_checker: MiscommunicationCheckerGetter | None
) -> TranscriptEvent:
    """Calls clinical-nlp (Blueprint Section 3.2 step 6) to compare the
    original Hindi against its back-translation, then folds the result's
    similarity score into confidence v2. Both fields are set together --
    a composite score without its underlying signals would be a fabricated
    number (Blueprint Section 11.1: no numeric fabrication), so
    confidence_v2/confidence_band stay None if the check didn't run.
    """
    if get_miscommunication_checker is None or event.back_translation is None:
        return event
    segment = event.segment
    assert segment is not None

    try:
        result = await get_miscommunication_checker().check(
            segment.text, event.back_translation.text, segment.language
        )
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("miscommunication check failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"miscommunication_error": str(exc)})

    composite = compute_confidence_v2(segment.confidence, result.similarity_score)
    return event.model_copy(
        update={
            "miscommunication": result,
            "confidence_v2": composite,
            "confidence_band": confidence_band(composite),
        }
    )


def _run_tts(event: TranscriptEvent, get_tts_provider: TTSProviderGetter | None) -> TranscriptEvent:
    if get_tts_provider is None or event.translation is None:
        return event
    try:
        tts_segment = get_tts_provider().synthesize(event.translation.text, event.translation.target_language)
        return event.model_copy(update={"tts": tts_segment})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("tts failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"tts_error": str(exc)})


async def _run_entity_extraction(
    event: TranscriptEvent, get_entity_extractor: EntityExtractorGetter | None
) -> TranscriptEvent:
    """Extracts medical entities from both sides of the bilingual
    transcript (Blueprint Section 2.2/2.4: inline keyword highlighting +
    entity categorization for both the Hindi original and the English
    translation). The two extractions are independent -- a failure on one
    side never blocks the other, same degrade-not-drop rule as every other
    stage in this chain.
    """
    if get_entity_extractor is None:
        return event
    segment = event.segment
    assert segment is not None

    try:
        entities = await get_entity_extractor().extract(segment.text, segment.language)
        event = event.model_copy(update={"entities": entities})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("entity extraction failed for utterance %s", event.utterance_id)
        event = event.model_copy(update={"entities_error": str(exc)})

    if event.translation is not None:
        try:
            translation_entities = await get_entity_extractor().extract(
                event.translation.text, event.translation.target_language
            )
            event = event.model_copy(update={"translation_entities": translation_entities})
        except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
            logger.exception("translation entity extraction failed for utterance %s", event.utterance_id)
            event = event.model_copy(update={"translation_entities_error": str(exc)})

    return event


async def _run_emergency_detection(
    event: TranscriptEvent, get_emergency_detector: EmergencyDetectorGetter | None
) -> TranscriptEvent:
    """Runs first in the enrichment chain (see _enrich_final_event's
    docstring) -- on the Hindi original, since that's available immediately
    with nothing else needing to run first."""
    if get_emergency_detector is None:
        return event
    segment = event.segment
    assert segment is not None

    try:
        result = await get_emergency_detector().detect(segment.text, segment.language)
        return event.model_copy(update={"emergency": result})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("emergency detection failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"emergency_error": str(exc)})


def _run_emotion_classification(
    event: TranscriptEvent, session: StreamingASRSession, get_emotion_classifier: EmotionClassifierGetter | None
) -> TranscriptEvent:
    if get_emotion_classifier is None:
        return event

    audio = session.get_utterance_audio(event.utterance_id)
    if audio is None:
        return event.model_copy(update={"emotion_error": "utterance audio unavailable for emotion classification"})

    try:
        assessment = get_emotion_classifier().classify(audio, session.sample_rate)
        return event.model_copy(update={"emotion": assessment})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("emotion classification failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"emotion_error": str(exc)})


async def _run_risk_scoring(event: TranscriptEvent, get_risk_scorer: RiskScorerGetter | None) -> TranscriptEvent:
    """Composes the emergency result and emotion signal computed earlier in
    this same chain -- runs last among Phase 6 additions so both inputs
    exist by the time it's called."""
    if get_risk_scorer is None:
        return event
    segment = event.segment
    assert segment is not None

    emotion_label = event.emotion.label if event.emotion else None
    emotion_confidence = event.emotion.confidence if event.emotion else None

    try:
        assessment = await get_risk_scorer().score(
            event.session_id, segment.text, segment.language, emotion_label, emotion_confidence
        )
        return event.model_copy(update={"risk": assessment})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("risk scoring failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"risk_error": str(exc)})


async def _record_utterance(
    event: TranscriptEvent, session_id: str, get_orchestrator_client: OrchestratorClientGetter | None
) -> None:
    """Best-effort: posts finalized utterances to orchestrator's
    conversation memory. Deliberately not folded into _enrich_final_event
    -- its outcome is never attached to the event sent to the client (see
    app.orchestrator_client's docstring for why), so it belongs after the
    client has already received its event, not in the enrichment chain
    that builds that event.

    Wrapped in its own try/except (unlike the real OrchestratorClient,
    which only swallows httpx errors) so that no matter what a given
    implementation does or doesn't catch internally, a memory-recording
    failure can never take down a connection that already delivered its
    event to the client.
    """
    if get_orchestrator_client is None or event.type != "final" or event.segment is None:
        return
    speaker = event.speaker.speaker_label if event.speaker else None
    translated_text = event.translation.text if event.translation else None
    try:
        await get_orchestrator_client().post_utterance(session_id, speaker, event.segment.text, translated_text)
    except Exception:  # noqa: BLE001 - best-effort side effect, must never crash the session
        logger.exception("failed to record utterance %s in orchestrator", event.utterance_id)


async def _post_timeline_event_safe(
    client: OrchestratorClient,
    session_id: str,
    event_type: TimelineEventType,
    description: str,
    source_utterance_id: str | None,
) -> None:
    try:
        await client.post_timeline_event(session_id, event_type, description, source_utterance_id)
    except Exception:  # noqa: BLE001 - best-effort side effect, must never crash the session
        logger.exception("failed to record timeline event (%s) in orchestrator", event_type)


async def _record_timeline_events(
    event: TranscriptEvent,
    session_id: str,
    get_orchestrator_client: OrchestratorClientGetter | None,
    last_risk_level: RiskLevel | None,
) -> RiskLevel | None:
    """Best-effort, same non-blocking rationale as _record_utterance --
    posts Blueprint Section 2.2's four timeline event types as they're
    observed on this already-enriched final event (symptom/medication
    mentions from entity extraction, emergency alerts, and risk-level
    changes tracked across this connection's utterances). "Alert dismissed"
    isn't posted from here -- it's a clinician UI action orchestrator
    records directly when the dismissal itself is submitted, not something
    speech-pipeline observes."""
    if get_orchestrator_client is None or event.type != "final" or event.segment is None:
        return last_risk_level

    client = get_orchestrator_client()

    for entity in (*(event.entities or []), *(event.translation_entities or [])):
        if entity.category == "symptom":
            await _post_timeline_event_safe(
                client, session_id, "symptom_mentioned", f"{entity.canonical_name} mentioned", event.utterance_id
            )
        elif entity.category == "medication":
            await _post_timeline_event_safe(
                client, session_id, "medication_mentioned", f"{entity.canonical_name} mentioned", event.utterance_id
            )

    if event.emergency is not None and event.emergency.alert and event.emergency.reason:
        await _post_timeline_event_safe(
            client, session_id, "alert_triggered", event.emergency.reason, event.utterance_id
        )

    new_level = event.risk.level if event.risk else None
    if new_level is not None and new_level != last_risk_level:
        await _post_timeline_event_safe(
            client, session_id, "risk_level_changed", f"Risk level changed to {new_level}", event.utterance_id
        )
        last_risk_level = new_level

    return last_risk_level


def _run_diarization(
    event: TranscriptEvent,
    session: StreamingASRSession,
    diarizer: SpeakerDiarizer | None,
    diarizer_error: str | None,
) -> TranscriptEvent:
    if diarizer is None:
        if diarizer_error is not None:
            return event.model_copy(update={"speaker_error": diarizer_error})
        return event

    audio = session.get_utterance_audio(event.utterance_id)
    if audio is None:
        return event.model_copy(update={"speaker_error": "utterance audio unavailable for diarization"})

    try:
        assignment = diarizer.assign_speaker(audio, session.sample_rate)
        return event.model_copy(update={"speaker": assignment})
    except Exception as exc:  # noqa: BLE001 - same degrade-not-crash rule as above
        logger.exception("diarization failed for utterance %s", event.utterance_id)
        return event.model_copy(update={"speaker_error": str(exc)})
