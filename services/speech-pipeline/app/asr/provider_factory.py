"""Default real-provider factory for production wiring (app/main.py).

Deferred/lazy so importing this module never requires faster-whisper to be
installed -- only calling get_asr_provider() does, and callers (the
WebSocket route) catch RuntimeError to fail loud with a client-visible
degraded-mode message instead of crashing the process
(Blueprint Section 6.1: "no single ML service outage can crash the session").
"""

from __future__ import annotations

import os
from functools import lru_cache

from app.asr.provider import ASRProvider


@lru_cache(maxsize=1)
def get_asr_provider() -> ASRProvider:
    if os.environ.get("MEDIBRIDGE_FIXTURE_MODE") == "1":
        # Deterministic, no model download -- used to run this real server
        # for Playwright E2E tests / local dev without pulling faster-whisper.
        from app.asr.fixture_provider import StaticASRProvider

        return StaticASRProvider()

    from app.asr.faster_whisper_provider import FasterWhisperASRProvider

    model_size = os.environ.get("ASR_MODEL_SIZE", "medium")

    device = os.environ.get("ASR_DEVICE")
    compute_type = os.environ.get("ASR_COMPUTE_TYPE")
    if not device:
        try:
            import torch
            if torch.cuda.is_available():
                device = "cuda"
                if not compute_type:
                    compute_type = "float16"
        except ImportError:
            pass

    if not device:
        device = "cpu"
    if not compute_type:
        compute_type = "float16" if device == "cuda" else "int8"

    asr_lang = os.environ.get("ASR_LANGUAGE", "")
    language = None if asr_lang in ("", "auto") else asr_lang
    initial_prompt = os.environ.get("ASR_INITIAL_PROMPT")

    return FasterWhisperASRProvider(
        model_size=model_size,
        device=device,
        compute_type=compute_type,
        language=language,
        initial_prompt=initial_prompt,
    )

