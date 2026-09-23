"""HTTP endpoint for synthesizing conversational patient care & medication instructions in spoken Hindi (or English).

Designed for non-literate, elderly, and rural patients who benefit from hearing
warm, clear spoken discharge advice instead of struggling with written slips.
"""

from __future__ import annotations

from typing import Callable
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.tts.provider import TTSProvider


class PatientInstructionRequest(BaseModel):
    medications: list[str] = Field(
        default_factory=list,
        description="List of prescribed medications with dosages/frequencies",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="Clinical advice, lifestyle instructions, dietary precautions",
    )
    follow_up: str | None = Field(
        default=None,
        description="Follow-up timing or review instructions",
    )
    language: str = Field(
        default="hi",
        description="Spoken language: 'hi' for Hindi, 'en' for English",
    )


class PatientInstructionResponse(BaseModel):
    audio_base64: str
    sample_rate: int
    format: str = "pcm16"
    spoken_script: str
    language: str


def build_spoken_script(req: PatientInstructionRequest) -> str:
    """Builds a clear, friendly spoken paragraph in Hindi or English."""
    is_hindi = req.language.lower().startswith("hi") or req.language == "hin"

    if is_hindi:
        parts: list[str] = ["नमस्ते। डॉक्टर के परामर्श अनुसार आपके स्वास्थ्य निर्देश इस प्रकार हैं।"]

        if req.medications:
            clean_meds = [m.replace("-", " ") for m in req.medications]
            med_text = "दवाइयों के निर्देश: " + "। ".join(clean_meds) + "।"
            parts.append(med_text)

        if req.recommendations:
            rec_text = "सावधानियां और सलाह: " + "। ".join(req.recommendations) + "।"
            parts.append(rec_text)

        if req.follow_up:
            parts.append(f"कृपया {req.follow_up} पर पुनः परामर्श लें।")

        parts.append("अपना ध्यान रखें और समय पर दवाइयां लें। धन्यवाद।")
        return " ".join(parts)
    else:
        parts = ["Hello. Here are your personalized medical instructions from the doctor."]
        if req.medications:
            parts.append("Medication instructions: " + "; ".join(req.medications) + ".")
        if req.recommendations:
            parts.append("Care advice: " + "; ".join(req.recommendations) + ".")
        if req.follow_up:
            parts.append(f"Please follow up {req.follow_up}.")
        parts.append("Take care and stay healthy. Thank you.")
        return " ".join(parts)


def create_patient_tts_router(tts_factory: Callable[[], TTSProvider]) -> APIRouter:
    router = APIRouter()

    @router.post("/tts/patient-instructions", response_model=PatientInstructionResponse)
    async def synthesize_patient_instructions(
        request: PatientInstructionRequest,
    ) -> PatientInstructionResponse:
        script = build_spoken_script(request)
        tts = tts_factory()
        audio_seg = tts.synthesize(script, language=request.language)

        return PatientInstructionResponse(
            audio_base64=audio_seg.audio_base64,
            sample_rate=audio_seg.sample_rate,
            format=audio_seg.format,
            spoken_script=script,
            language=request.language,
        )

    return router
