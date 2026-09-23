from fastapi.testclient import TestClient

from app.main import app
from app.routes.patient_tts import (
    PatientInstructionRequest,
    build_spoken_script,
    create_patient_tts_router,
)
from app.tts.fixture_provider import StaticTTSProvider


def test_build_spoken_script_hindi() -> None:
    req = PatientInstructionRequest(
        medications=["Paracetamol 500mg - 1 गोली दिन में दो बार", "Cetirizine 10mg - रात में"],
        recommendations=["हल्का भोजन लें और पर्याप्त पानी पिएं"],
        follow_up="3 दिन बाद",
        language="hi",
    )
    script = build_spoken_script(req)
    assert "नमस्ते" in script
    assert "दवाइयों के निर्देश" in script
    assert "Paracetamol" in script
    assert "सावधानियां और सलाह" in script
    assert "3 दिन बाद" in script
    assert "धन्यवाद" in script


def test_build_spoken_script_english() -> None:
    req = PatientInstructionRequest(
        medications=["Amoxicillin 500mg tid"],
        recommendations=["Hydrate well", "Rest"],
        follow_up="next Monday",
        language="en",
    )
    script = build_spoken_script(req)
    assert "Hello" in script
    assert "Medication instructions" in script
    assert "Amoxicillin" in script
    assert "next Monday" in script


def test_patient_tts_router_endpoint() -> None:
    # Use router directly with StaticTTSProvider
    router = create_patient_tts_router(lambda: StaticTTSProvider(sample_rate=16_000))
    from fastapi import FastAPI
    test_app = FastAPI()
    test_app.include_router(router)
    tc = TestClient(test_app)

    payload = {
        "medications": ["Paracetamol 500mg"],
        "recommendations": ["Drink warm water"],
        "follow_up": "after 2 days",
        "language": "hi",
    }
    res = tc.post("/tts/patient-instructions", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "audio_base64" in data
    assert data["sample_rate"] == 16000
    assert data["format"] == "pcm16"
    assert "Paracetamol" in data["spoken_script"]
