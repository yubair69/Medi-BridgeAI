"""Streaming session: turns an incoming PCM16 audio chunk stream into
partial/final TranscriptEvents, using a simple energy-based VAD to find
utterance boundaries (Blueprint Section 2.1: "voice-activity detection").

This is intentionally a plain RMS-energy gate, not a model-based VAD
(webrtcvad/Silero) -- enough to segment fixture audio for Phase 1 and keeps
this phase dependency-light. A model-based VAD is Phase 6 (noise/accent
robustness) scope, not a Phase 1 blocker; documented as an assumption in
docs/PROGRESS.md.
"""

from __future__ import annotations

import array
import logging
import statistics
import time
import uuid
from dataclasses import dataclass, field

from app.asr.provider import ASRProvider
from app.asr.schemas import TranscriptEvent, TranscriptSegment

logger = logging.getLogger(__name__)

FRAME_MS = 30
SILENCE_HANG_MS = 500  # sustained silence before an utterance is finalized
PARTIAL_INTERVAL_MS = 600  # minimum spacing between partial updates
# plain RMS gate: 250 handles normal conversational mic input while filtering ambient hiss/fan noise.
# Tune via ASR_RMS_THRESHOLD env var if needed.
import os as _os
RMS_SPEECH_THRESHOLD = int(_os.environ.get("ASR_RMS_THRESHOLD", "250"))


def frame_byte_size(sample_rate: int, frame_ms: int = FRAME_MS) -> int:
    samples_per_frame = int(sample_rate * frame_ms / 1000)
    return samples_per_frame * 2  # 16-bit PCM = 2 bytes/sample


def _rms(frame: bytes) -> float:
    usable_len = len(frame) - (len(frame) % 2)
    if usable_len <= 0:
        return 0.0
    samples = array.array("h")
    samples.frombytes(frame[:usable_len])
    if not samples:
        return 0.0
    return float((sum(s * s for s in samples) / len(samples)) ** 0.5)


def _merge_segments(segments: list[TranscriptSegment], is_final: bool, elapsed_ms: int) -> TranscriptSegment:
    text = " ".join(s.text for s in segments if s.text).strip()
    confidence = statistics.fmean(s.confidence for s in segments) if segments else 0.0
    language = segments[0].language if segments else "hi"
    return TranscriptSegment(
        text=text,
        is_final=is_final,
        confidence=confidence,
        start_ms=0,
        end_ms=elapsed_ms,
        language=language,
    )


@dataclass
class _Utterance:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    audio: bytearray = field(default_factory=bytearray)
    last_partial_at: float = 0.0
    silence_ms: int = 0


class StreamingASRSession:
    """One instance per WebSocket connection (Blueprint Section 3.2 steps 1-3)."""

    def __init__(self, provider: ASRProvider, sample_rate: int = 16_000) -> None:
        self._provider = provider
        self._sample_rate = sample_rate
        self._frame_bytes = frame_byte_size(sample_rate)
        self._buf = bytearray()
        self._utterance: _Utterance | None = None
        # Bounded cache of finalized utterances' raw audio, keyed by
        # utterance_id, so callers (e.g. the diarizer) can look up the exact
        # audio behind a "final" event without threading it through the
        # public event API. Keyed rather than "last emitted" because a
        # single push_chunk() call can finalize more than one utterance
        # (e.g. a large chunk containing two full utterances back to back).
        self._utterance_audio_cache: dict[str, bytes] = {}
        self._cache_order: list[str] = []

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    def get_utterance_audio(self, utterance_id: str) -> bytes | None:
        return self._utterance_audio_cache.get(utterance_id)

    def _cache_utterance_audio(self, utterance_id: str, audio: bytes) -> None:
        self._utterance_audio_cache[utterance_id] = audio
        self._cache_order.append(utterance_id)
        max_cached = 8
        while len(self._cache_order) > max_cached:
            oldest = self._cache_order.pop(0)
            self._utterance_audio_cache.pop(oldest, None)

    def push_chunk(self, chunk: bytes) -> list[TranscriptEvent]:
        """Feed raw PCM16 mono bytes; returns zero or more events to send."""
        events: list[TranscriptEvent] = []
        self._buf.extend(chunk)

        while len(self._buf) >= self._frame_bytes:
            frame = bytes(self._buf[: self._frame_bytes])
            del self._buf[: self._frame_bytes]
            events.extend(self._process_frame(frame))

        return events

    def flush(self) -> list[TranscriptEvent]:
        """Force-finalize any in-progress utterance (e.g. on disconnect)."""
        if self._utterance is not None and self._utterance.audio:
            return [self._finalize()]
        return []

    def _process_frame(self, frame: bytes) -> list[TranscriptEvent]:
        events: list[TranscriptEvent] = []
        is_speech = _rms(frame) >= RMS_SPEECH_THRESHOLD

        if is_speech:
            if self._utterance is None:
                self._utterance = _Utterance()
            self._utterance.audio.extend(frame)
            self._utterance.silence_ms = 0

            now = time.monotonic()
            if (now - self._utterance.last_partial_at) * 1000 >= PARTIAL_INTERVAL_MS:
                self._utterance.last_partial_at = now
                events.append(self._emit(is_final=False))
        elif self._utterance is not None:
            self._utterance.silence_ms += FRAME_MS
            if self._utterance.silence_ms >= SILENCE_HANG_MS:
                events.append(self._finalize())

        return events

    def _emit(self, *, is_final: bool) -> TranscriptEvent:
        assert self._utterance is not None
        utterance = self._utterance
        # Duration of buffered audio content, not wall-clock processing time
        # (a fast fixture replay processes frames far faster than real-time,
        # so wall-clock elapsed time would be near-zero and meaningless here).
        elapsed_ms = int(len(utterance.audio) / 2 / self._sample_rate * 1000)

        request_start = time.monotonic()
        segments = self._provider.transcribe(bytes(utterance.audio), self._sample_rate)
        latency_ms = (time.monotonic() - request_start) * 1000

        if is_final:
            self._cache_utterance_audio(utterance.id, bytes(utterance.audio))

        return TranscriptEvent(
            type="final" if is_final else "partial",
            utterance_id=utterance.id,
            segment=_merge_segments(segments, is_final, elapsed_ms),
            latency_ms=latency_ms,
        )

    def _finalize(self) -> TranscriptEvent:
        event = self._emit(is_final=True)
        if event.segment and event.segment.text:
            logger.info(
                "Utterance %s finalized: text=%r duration_ms=%d (latency=%.1fms)",
                event.utterance_id[:8],
                event.segment.text,
                event.segment.end_ms,
                event.latency_ms or 0.0,
            )
        self._utterance = None
        return event
