import asyncio

import pytest

from app.summarization.local_summarizer import LocalClinicalSummarizer
from app.summarization.provider_factory import get_summarizer
from app.summarization.schemas import SummaryUtterance


def test_local_summarizer_extracts_grounded_clinical_bullets() -> None:
    summarizer = LocalClinicalSummarizer()

    utterances = [
        SummaryUtterance(
            utterance_id="u-1",
            speaker="patient",
            original_text="Doctor, I have severe chest pain and fever for 2 days.",
            translated_text="Doctor, I have severe chest pain and fever for 2 days.",
        ),
        SummaryUtterance(
            utterance_id="u-2",
            speaker="doctor",
            original_text="Your blood pressure is 130/85 and temperature is 101 F.",
            translated_text="Your blood pressure is 130/85 and temperature is 101 F.",
        ),
        SummaryUtterance(
            utterance_id="u-3",
            speaker="doctor",
            original_text="Take paracetamol 500mg and get an ECG done.",
            translated_text="Take paracetamol 500mg and get an ECG done.",
        ),
        SummaryUtterance(
            utterance_id="u-4",
            speaker="doctor",
            original_text="Please follow up and see you in 3 days.",
            translated_text="Please follow up and see you in 3 days.",
        ),
    ]

    summary = asyncio.run(summarizer.summarize(utterances))

    assert summary.model_name in ("local-clinical-nlp", "Falconsai/medical_summarization")
    assert summary.discarded_ungrounded_count == 0

    # Verify objective findings
    assert any("130/85" in b.text for b in summary.objective)
    assert any("101" in b.text for b in summary.objective)
    for b in summary.objective:
        assert b.source_utterance_id == "u-2"

    # Verify complaints or symptoms
    assert len(summary.complaints) > 0 or len(summary.symptoms) > 0
    # Verify medications
    assert any("paracetamol" in b.text.lower() for b in summary.medications)
    # Verify action items
    assert any("ecg" in b.text.lower() for b in summary.action_items)
    # Verify follow-up
    assert any("follow" in b.text.lower() for b in summary.follow_up)


def test_provider_factory_falls_back_to_local_summarizer(monkeypatch: pytest.MonkeyPatch) -> None:
    get_summarizer.cache_clear()
    monkeypatch.delenv("MEDIBRIDGE_FIXTURE_MODE", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    summarizer = get_summarizer()
    assert isinstance(summarizer, LocalClinicalSummarizer)
