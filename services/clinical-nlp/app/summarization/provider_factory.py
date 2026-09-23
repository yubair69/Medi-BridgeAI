"""Lazy singleton factory for the real summarizer, mirroring
app.miscommunication.provider_factory. Reads OPENROUTER_API_KEY /
OPENROUTER_SUMMARIZATION_MODEL from the environment -- see .env.example."""

from __future__ import annotations

import os
from functools import lru_cache

from app.summarization.provider import Summarizer


@lru_cache(maxsize=1)
def get_summarizer() -> Summarizer:
    if os.environ.get("MEDIBRIDGE_FIXTURE_MODE") == "1":
        from app.summarization.fixture_provider import StaticSummarizer

        return StaticSummarizer()

    from app.summarization.local_summarizer import LocalClinicalSummarizer
    from app.summarization.openrouter_provider import OpenRouterSummarizer

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return LocalClinicalSummarizer()

    model_name = os.environ.get("OPENROUTER_SUMMARIZATION_MODEL", "anthropic/claude-sonnet-4.5")
    return OpenRouterSummarizer(api_key=api_key, model_name=model_name)
