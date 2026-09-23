from unittest.mock import MagicMock
from app.ner.neural_ner_provider import NeuralClinicalNERProvider, get_neural_ner_provider


def test_neural_ner_provider_graceful_fallback() -> None:
    provider = NeuralClinicalNERProvider(model_name="nonexistent-model")
    # In test/dev environment where the model is not downloaded, it should gracefully return empty
    entities = provider.extract("Patient has mild dyspnea and hypertension.")
    assert isinstance(entities, list)


def test_neural_ner_provider_extracts_mapped_entities() -> None:
    provider = NeuralClinicalNERProvider()
    text = "Patient reports dyspnea and hypertension; prescribed amlodipine."
    dyspnea_start = text.index("dyspnea")
    dyspnea_end = dyspnea_start + len("dyspnea")
    htn_start = text.index("hypertension")
    htn_end = htn_start + len("hypertension")
    amlo_start = text.index("amlodipine")
    amlo_end = amlo_start + len("amlodipine")

    mock_pipe = MagicMock()
    mock_pipe.return_value = [
        {
            "entity_group": "Sign_symptom",
            "word": "dyspnea",
            "score": 0.95,
            "start": dyspnea_start,
            "end": dyspnea_end,
        },
        {
            "entity_group": "Disease_disorder",
            "word": "hypertension",
            "score": 0.92,
            "start": htn_start,
            "end": htn_end,
        },
        {
            "entity_group": "Medication",
            "word": "amlodipine",
            "score": 0.88,
            "start": amlo_start,
            "end": amlo_end,
        },
    ]

    provider._pipe = mock_pipe
    provider._initialized = True
    entities = provider.extract(text)

    assert len(entities) == 3
    assert entities[0].category == "symptom"
    assert entities[0].canonical_name == "Dyspnea"
    assert entities[0].confidence == 0.95
    assert text[entities[0].start_char : entities[0].end_char] == "dyspnea"

    assert entities[1].category == "disease"
    assert entities[1].canonical_name == "Hypertension"

    assert entities[2].category == "medication"
    assert entities[2].canonical_name == "Amlodipine"


def test_get_neural_ner_provider_singleton() -> None:
    p1 = get_neural_ner_provider()
    p2 = get_neural_ner_provider()
    assert p1 is p2
