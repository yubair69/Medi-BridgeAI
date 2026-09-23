"""Real ASR provider: faster-whisper (CTranslate2 Whisper), chosen for Phase 1
per the decision recorded in docs/PROGRESS.md -- local/self-hosted so no
third-party retains patient audio (Blueprint Section 6.1 hard constraint).

Import of faster_whisper/numpy is deferred into __init__ so importing this
module (and app.main, which wires providers) never requires the heavy
dependency to be installed -- tests run against FixtureASRProvider instead.
"""

from __future__ import annotations

import logging
import math

from app.asr.provider import ASRProvider
from app.asr.schemas import TranscriptSegment

logger = logging.getLogger(__name__)

EXPECTED_SAMPLE_RATE = 16_000


DEFAULT_INITIAL_PROMPT = (
    "Medical clinical consultation between doctor and patient: blood pressure, SpO2, heart rate, "
    "temperature, mmHg, bpm, Warfarin, Aspirin, Penicillin, Amoxicillin, Paracetamol, "
    "Azithromycin, Lisinopril, allergy, chest pain, dizziness, headache."
)


MODEL_ALIASES: dict[str, str] = {
    "large-v4": "large-v3",
    "large_v4": "large-v3",
    "v4": "large-v3",
    "turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
    "large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
    "large-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
}


class FasterWhisperASRProvider(ASRProvider):
    def __init__(
        self,
        model_size: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
        language: str | None = None,
        initial_prompt: str | None = None,
    ) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:  # pragma: no cover - exercised only when the
            # optional heavy dependency isn't installed.
            raise RuntimeError(
                "faster-whisper is not installed. Install "
                "services/speech-pipeline/requirements-asr.txt to use the real "
                "ASR provider; otherwise use FixtureASRProvider for tests."
            ) from exc

        resolved_model = MODEL_ALIASES.get(model_size.lower().strip(), model_size)
        logger.info(
            "Initializing FasterWhisper (requested=%s, resolved=%s, device=%s, compute=%s, lang=%s)",
            model_size, resolved_model, device, compute_type, language,
        )
        self._model = WhisperModel(resolved_model, device=device, compute_type=compute_type)
        self._language = language
        self._initial_prompt = initial_prompt if initial_prompt is not None else DEFAULT_INITIAL_PROMPT


    def transcribe(self, pcm16_mono: bytes, sample_rate: int) -> list[TranscriptSegment]:
        if sample_rate != EXPECTED_SAMPLE_RATE:
            raise ValueError(
                f"FasterWhisperASRProvider expects {EXPECTED_SAMPLE_RATE}Hz audio, "
                f"got {sample_rate}Hz. Resample before calling transcribe()."
            )

        import numpy as np

        audio = np.frombuffer(pcm16_mono, dtype="<i2").astype(np.float32) / 32768.0
        # StreamingASRSession already segments frames; turning off Whisper's internal
        # Silero VAD prevents dropping short/conversational utterances while no_speech_prob
        # handles actual silence.
        segments, info = self._model.transcribe(
            audio,
            language=self._language,
            initial_prompt=self._initial_prompt,
            condition_on_previous_text=False,
            beam_size=5,
            temperature=0.0,
            vad_filter=False,
            word_timestamps=False,
        )


        results: list[TranscriptSegment] = []
        for seg in segments:
            # Drop segments Whisper itself flags as likely silence/hallucination.
            if getattr(seg, "no_speech_prob", 0.0) > 0.6:
                continue
            confidence = math.exp(seg.avg_logprob) if seg.avg_logprob is not None else 0.0
            results.append(
                TranscriptSegment(
                    text=seg.text.strip(),
                    is_final=True,
                    confidence=min(max(confidence, 0.0), 1.0),
                    start_ms=int(seg.start * 1000),
                    end_ms=int(seg.end * 1000),
                    language=info.language or self._language or "hi",
                )
            )

        duration_s = len(audio) / EXPECTED_SAMPLE_RATE
        text_summary = " ".join(r.text for r in results if r.text).strip()
        logger.info(
            "FasterWhisper transcribed %.2fs (lang=%s, segs=%d): %r",
            duration_s,
            info.language,
            len(results),
            text_summary,
        )
        return results
