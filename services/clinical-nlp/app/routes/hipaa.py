"""HTTP endpoints for HIPAA Safe Harbor 18 PHI redaction and NeMo clinical guardrails."""

from __future__ import annotations

from typing import Callable

from fastapi import APIRouter

from app.hipaa.guardrails import ClinicalGuardrailsEngine, get_guardrails_engine
from app.hipaa.presidio_redactor import PHIRedactor, get_phi_redactor
from app.hipaa.schemas import (
    DeidentifySessionRequest,
    DeidentifySessionResponse,
    GuardrailValidationRequest,
    GuardrailValidationResponse,
    RedactionRequest,
    RedactionResult,
)


def create_hipaa_router(
    get_redactor: Callable[[], PHIRedactor] = get_phi_redactor,
    get_guardrails: Callable[[], ClinicalGuardrailsEngine] = get_guardrails_engine,
) -> APIRouter:
    router = APIRouter()

    @router.post("/hipaa/redact", response_model=RedactionResult)
    async def redact_phi(request: RedactionRequest) -> RedactionResult:
        redactor = get_redactor()
        return redactor.redact(request.text, mask_style=request.mask_style)

    @router.post("/hipaa/deidentify-session", response_model=DeidentifySessionResponse)
    async def deidentify_session(request: DeidentifySessionRequest) -> DeidentifySessionResponse:
        redactor = get_redactor()
        redacted_entries: list[str] = []
        total_spans = 0

        for entry in request.text_entries:
            res = redactor.redact(entry)
            redacted_entries.append(res.redacted_text)
            total_spans += len(res.spans)

        return DeidentifySessionResponse(
            session_id=request.session_id,
            redacted_entries=redacted_entries,
            total_spans_redacted=total_spans,
            phi_detected=total_spans > 0,
        )

    @router.post("/guardrails/validate", response_model=GuardrailValidationResponse)
    async def validate_guardrails(request: GuardrailValidationRequest) -> GuardrailValidationResponse:
        guardrails = get_guardrails()
        return guardrails.validate(
            text=request.text,
            direction=request.direction,
            context_utterances=request.context_utterances,
        )

    return router
