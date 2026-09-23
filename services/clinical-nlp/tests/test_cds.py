from fastapi.testclient import TestClient

from app.cds.ddi_checker import (
    check_allergy_contraindications,
    check_drug_interactions,
    detect_patient_allergies,
    evaluate_cds,
)
from app.cds.schemas import CdsCheckRequest
from app.main import app

client = TestClient(app)


def test_ddi_detects_critical_warfarin_aspirin_interaction() -> None:
    alerts = check_drug_interactions(["Warfarin 5mg", "Aspirin 75mg"])
    assert len(alerts) == 1
    assert alerts[0].severity == "CRITICAL"
    assert "bleeding" in alerts[0].clinical_risk.lower() or "hemorrhage" in alerts[0].clinical_risk.lower()
    assert alerts[0].drug_a in ("Warfarin 5mg", "Aspirin 75mg")


def test_ddi_detects_serotonin_syndrome_ssri_tramadol() -> None:
    alerts = check_drug_interactions(["Sertraline", "Tramadol"])
    assert len(alerts) == 1
    assert alerts[0].severity == "CRITICAL"
    assert "serotonin" in alerts[0].clinical_risk.lower()


def test_ddi_detects_hyperkalemia_acei_spironolactone() -> None:
    alerts = check_drug_interactions(["Ramipril", "Spironolactone"])
    assert len(alerts) == 1
    assert alerts[0].severity == "MAJOR"
    assert "hyperkalemia" in alerts[0].clinical_risk.lower()


def test_allergy_extraction_from_patient_utterance() -> None:
    utterances = [
        "Doctor, I have severe knee pain.",
        "Also, please note that I am allergic to penicillin.",
    ]
    allergens = detect_patient_allergies(utterances, [])
    assert "penicillin" in allergens


def test_allergy_contraindication_triggers_critical_alert() -> None:
    allergens = {"penicillin"}
    alerts = check_allergy_contraindications(["Amoxicillin 500mg"], allergens)
    assert len(alerts) == 1
    assert alerts[0].severity == "CRITICAL"
    assert "Amoxicillin 500mg" in alerts[0].medication


def test_cds_endpoint() -> None:
    payload = {
        "medications": ["Warfarin", "Ibuprofen"],
        "patient_utterances": ["Doctor, penicillin se mujhe allergy hai."],
        "known_allergies": [],
    }
    response = client.post("/cds/check-interactions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["total_alerts"] >= 1
    assert data["has_critical"] is True
    assert len(data["interactions"]) >= 1
