"""Verifies MEDIBRIDGE_FIXTURE_MODE=1 routes every provider factory to its
Static* provider instead of attempting to load a real model -- this is what
lets app/main.py's real FastAPI server run deterministically for Playwright
E2E tests without downloading faster-whisper/NLLB/mms-tts/ECAPA-TDNN.
"""

from __future__ import annotations

import pytest

from app.asr.fixture_provider import StaticASRProvider
from app.asr.provider_factory import get_asr_provider
from app.diarization.fixture_provider import StaticEmbeddingProvider
from app.diarization.provider_factory import get_embedding_provider
from app.emotion.fixture_provider import StaticEmotionClassifier
from app.emotion.prosody_classifier import ProsodyEmotionClassifier
from app.emotion.provider_factory import get_emotion_classifier
from app.mt.fixture_provider import StaticMTProvider
from app.mt.provider_factory import get_mt_provider
from app.tts.fixture_provider import StaticTTSProvider
from app.tts.provider_factory import get_tts_provider


@pytest.fixture(autouse=True)
def _clear_factory_caches() -> None:
    # Each factory is @lru_cache(maxsize=1); without clearing, whichever
    # test runs first would poison every later test in this module.
    get_asr_provider.cache_clear()
    get_mt_provider.cache_clear()
    get_tts_provider.cache_clear()
    get_embedding_provider.cache_clear()
    get_emotion_classifier.cache_clear()


def test_fixture_mode_selects_static_asr_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIBRIDGE_FIXTURE_MODE", "1")
    assert isinstance(get_asr_provider(), StaticASRProvider)


def test_fixture_mode_selects_static_mt_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIBRIDGE_FIXTURE_MODE", "1")
    assert isinstance(get_mt_provider(), StaticMTProvider)


def test_fixture_mode_selects_static_tts_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIBRIDGE_FIXTURE_MODE", "1")
    assert isinstance(get_tts_provider(), StaticTTSProvider)


def test_fixture_mode_selects_static_embedding_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIBRIDGE_FIXTURE_MODE", "1")
    assert isinstance(get_embedding_provider(), StaticEmbeddingProvider)


def test_fixture_mode_selects_static_emotion_classifier(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIBRIDGE_FIXTURE_MODE", "1")
    assert isinstance(get_emotion_classifier(), StaticEmotionClassifier)


def test_fixture_mode_off_selects_the_real_prosody_emotion_classifier(monkeypatch: pytest.MonkeyPatch) -> None:
    """Unlike ASR/MT/diarization, the real emotion classifier is lightweight
    pure-numpy DSP (no heavy download), so -- with numpy installed in this
    dev environment -- the non-fixture-mode branch succeeds rather than
    raising, proving fixture mode isn't wrongly selected by default here
    the way test_fixture_mode_off_by_default_attempts_the_real_provider
    proves it for ASR (whose real deps genuinely aren't installed)."""
    monkeypatch.delenv("MEDIBRIDGE_FIXTURE_MODE", raising=False)
    assert isinstance(get_emotion_classifier(), ProsodyEmotionClassifier)


def test_fixture_mode_off_by_default_attempts_the_real_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Without MEDIBRIDGE_FIXTURE_MODE, the factory must take the "real
    provider" branch, not silently fall back to the static one.
    If faster-whisper is installed, it returns a FasterWhisperASRProvider.
    If faster-whisper is not installed, it raises RuntimeError."""
    monkeypatch.delenv("MEDIBRIDGE_FIXTURE_MODE", raising=False)
    try:
        provider = get_asr_provider()
        from app.asr.faster_whisper_provider import FasterWhisperASRProvider
        assert isinstance(provider, FasterWhisperASRProvider)
    except RuntimeError as exc:
        assert "faster-whisper is not installed" in str(exc)

