from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_hipaa_redact_endpoint() -> None:
    payload = {
        "text": "Call patient at 9876543210 or email patient@example.com",
        "mask_style": "category_bracket",
    }
    response = client.post("/hipaa/redact", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["phi_detected"] is True
    assert "<PHONE>" in data["redacted_text"]
    assert "<EMAIL>" in data["redacted_text"]


def test_guardrails_validate_endpoint() -> None:
    payload = {
        "text": "Patient has severe chest pain radiating to arm.",
        "direction": "input",
    }
    response = client.post("/guardrails/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "emergency_escalation_rail" in data["flagged_rails"]
    assert data["disclaimer"] != ""
