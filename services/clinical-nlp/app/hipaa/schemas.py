from __future__ import annotations

from typing import Literal
from pydantic import BaseModel

PHICategory = Literal[
    "NAME",
    "LOCATION",
    "DATE",
    "PHONE",
    "FAX",
    "EMAIL",
    "SSN",
    "MRN",
    "HEALTH_PLAN_ID",
    "ACCOUNT_NUMBER",
    "LICENSE_NUMBER",
    "VEHICLE_ID",
    "DEVICE_ID",
    "URL",
    "IP_ADDRESS",
    "BIOMETRIC_ID",
    "AADHAAR",
    "ABHA",
    "OTHER_IDENTIFIER",
]


class PHISpan(BaseModel):
    model_config = {"strict": True}

    category: PHICategory
    text: str
    start_char: int
    end_char: int
    replacement: str
    confidence: float


class RedactionResult(BaseModel):
    model_config = {"strict": True}

    original_text: str
    redacted_text: str
    spans: list[PHISpan]
    phi_detected: bool


class RedactionRequest(BaseModel):
    model_config = {"strict": True}

    text: str
    mask_style: Literal["category_bracket", "redacted_label", "asterisk"] = "category_bracket"


class DeidentifySessionRequest(BaseModel):
    model_config = {"strict": True}

    session_id: str
    text_entries: list[str]


class DeidentifySessionResponse(BaseModel):
    model_config = {"strict": True}

    session_id: str
    redacted_entries: list[str]
    total_spans_redacted: int
    phi_detected: bool


class GuardrailValidationRequest(BaseModel):
    model_config = {"strict": True}

    text: str
    direction: Literal["input", "output", "both"] = "both"
    context_utterances: list[str] | None = None


class GuardrailValidationResponse(BaseModel):
    model_config = {"strict": True}

    passed: bool
    flagged_rails: list[str]
    risk_mitigation: str | None
    safe_text: str
    disclaimer: str
