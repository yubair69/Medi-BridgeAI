"""Lazy singleton factory for the real TTS provider, mirroring
app.asr.provider_factory."""

from __future__ import annotations

import os
from functools import lru_cache

from app.tts.provider import TTSProvider


@lru_cache(maxsize=1)
def get_tts_provider() -> TTSProvider:
    if os.environ.get("MEDIBRIDGE_FIXTURE_MODE") == "1":
        from app.tts.fixture_provider import StaticTTSProvider

        return StaticTTSProvider()

    from app.tts.mms_provider import MmsTTSProvider

    model_name = os.environ.get("TTS_MODEL_NAME")
    return MmsTTSProvider(model_name=model_name)
