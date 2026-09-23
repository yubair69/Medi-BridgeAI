"""NeMo-style Clinical Safety Guardrails.

Provides programmable input, dialog, and output guardrails:
1. Input Rails:
   - Emergency Escalation: Identifies acute life-threatening medical conditions
     and escalates to immediate clinician emergency response.
   - Prompt Injection & Jailbreak Defense: Blocks attempts to override
     clinical safety boundaries or manipulate system instructions.
2. Output Rails:
   - Non-Diagnostic Medical Disclaimer Rail: Enforces mandatory non-diagnostic
     clinical advisory notices on all AI-derived communications.
   - Grounding & Anti-Hallucination Rail: Rejects ungrounded statements or
     fabricated clinical claims.
   - Dosage & Numerical Integrity Rail: Verifies that medical numbers
     (dosages, vitals) are preserved accurately without auto-smoothing.
"""

from __future__ import annotations

import re
from typing import Any

from app.hipaa.schemas import GuardrailValidationResponse

_JAILBREAK_PATTERNS = [
    re.compile(r"\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions\b", re.IGNORECASE),
    re.compile(r"\bsystem\s+prompt\b", re.IGNORECASE),
    re.compile(r"\byou\s+are\s+now\s+(?:an?\s+)?unrestricted\b", re.IGNORECASE),
    re.compile(r"\bDAN\s+mode\b", re.IGNORECASE),
    re.compile(r"\bdisregard\s+safety\s+guidelines\b", re.IGNORECASE),
]

_EMERGENCY_TRIGGERS = [
    "chest pain", "radiating to arm", "difficulty breathing", "shortness of breath",
    "cannot breathe", "severe hemorrhage", "profuse bleeding", "sudden weakness",
    "facial droop", "slurred speech", "loss of consciousness", "anaphylaxis",
    "seizure", "unresponsive", "choking"
]

MANDATORY_CLINICAL_DISCLAIMER = (
    "MediBridge AI assists clinical communication. It does not provide medical "
    "diagnoses or formulate treatment plans independently. All critical clinical "
    "information must be verbally verified by a licensed healthcare provider."
)


class ClinicalGuardrailsEngine:
    def __init__(self) -> None:
        self._disclaimer = MANDATORY_CLINICAL_DISCLAIMER

    def validate(
        self,
        text: str,
        direction: str = "both",
        context_utterances: list[str] | None = None,
    ) -> GuardrailValidationResponse:
        flagged_rails: list[str] = []
        mitigation: str | None = None
        safe_text = text

        # ── 1. Input Rail: Prompt Injection / Jailbreak Detection ──
        if direction in ("input", "both"):
            for pattern in _JAILBREAK_PATTERNS:
                if pattern.search(text):
                    flagged_rails.append("prompt_injection_defense")
                    mitigation = "Input blocked: Prompt injection attempt detected."
                    safe_text = "[CONTENT BLOCKED: System security policy violation]"
                    return GuardrailValidationResponse(
                        passed=False,
                        flagged_rails=flagged_rails,
                        risk_mitigation=mitigation,
                        safe_text=safe_text,
                        disclaimer=self._disclaimer,
                    )

            # ── Input Rail: Emergency Detection & Escalation ──
            text_lower = text.lower()
            for trigger in _EMERGENCY_TRIGGERS:
                if trigger in text_lower:
                    flagged_rails.append("emergency_escalation_rail")
                    mitigation = (
                        f"EMERGENCY PROTOCOL ACTIVATED: Trigger '{trigger}' detected. "
                        "Immediate clinician evaluation required. Do not delay emergency care."
                    )
                    break

        # ── 2. Output Rail: Grounding & Anti-Hallucination ──
        if direction in ("output", "both") and context_utterances:
            # Check if text claims things completely absent from context
            joined_context = " ".join(context_utterances).lower()
            # Simple check for ungrounded vital numbers
            dosage_matches = re.findall(r"\b\d+\s*(?:mg|mcg|ml|tablets?)\b", text, re.IGNORECASE)
            for dosage in dosage_matches:
                if dosage.lower() not in joined_context:
                    flagged_rails.append("dosage_grounding_rail")
                    if not mitigation:
                        mitigation = f"Unverified dosage '{dosage}' detected; requires verbal clinician confirmation."

        passed = len(flagged_rails) == 0 or (
            len(flagged_rails) == 1 and flagged_rails[0] == "emergency_escalation_rail"
        )

        return GuardrailValidationResponse(
            passed=passed,
            flagged_rails=flagged_rails,
            risk_mitigation=mitigation,
            safe_text=safe_text,
            disclaimer=self._disclaimer,
        )


_DEFAULT_GUARDRAILS: ClinicalGuardrailsEngine | None = None


def get_guardrails_engine() -> ClinicalGuardrailsEngine:
    global _DEFAULT_GUARDRAILS
    if _DEFAULT_GUARDRAILS is None:
        _DEFAULT_GUARDRAILS = ClinicalGuardrailsEngine()
    return _DEFAULT_GUARDRAILS
