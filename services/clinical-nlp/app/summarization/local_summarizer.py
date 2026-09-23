"""Local clinical summarizer that operates self-hosted without external API keys.

Extracts structured clinical SOAP sections (complaints, symptoms, objective
findings, medications, mentioned diagnoses, recommendations, action items,
and follow-up) directly from transcript utterances using medical lexicon
matching and deterministic clinical pattern extractors.

Guarantees 100% span-grounding: every single bullet cites an exact
source_utterance_id from the transcript and satisfies grounding validation.
"""

from __future__ import annotations

import os
import re
from typing import Any

from app.lexicons.loader import MedicalLexicon, load_lexicon
from app.summarization.grounding import validate_bullets
from app.summarization.provider import Summarizer
from app.summarization.schemas import StructuredSummary, SummaryBullet, SummaryUtterance

_SUMMARY_SCHEMA_FIELDS = (
    "complaints",
    "symptoms",
    "objective",
    "diagnoses_mentioned",
    "medications",
    "recommendations",
    "action_items",
    "follow_up",
)

# Regex patterns for clinical extraction
_BP_PATTERN = re.compile(r"\b(?:bp|blood\s*pressure)?\s*(?:is\s*)?(\d{2,3}(?:\s*(?:[/]|over)\s*)\d{2,3})\s*(?:mm\s*hg)?\b", re.IGNORECASE)
_TEMP_PATTERN = re.compile(r"\b(?:temp(?:erature)?|fever)?\s*(?:is|at|of)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:deg(?:rees)?\s*(?:fahrenheit|celsius|f|c)?|[°\s]?[fc]|fahrenheit|celsius)\b", re.IGNORECASE)
_PULSE_PATTERN = re.compile(r"(?:\b(?:pulse(?:\s*rate)?|heart\s*rate|hr)\s*(?:is|if|of|:)?\s*(\d{2,3})|\b(\d{2,3})\s*(?:bpm|beats\s*(?:per\s*min(?:ute)?|\/min)?))\b", re.IGNORECASE)
_SPO2_PATTERN = re.compile(r"\b(?:spo2|oxygen|o2|sat(?:uration)?)\s*(?:is|if|of|:)?\s*(\d{2,3})\s*%?\b", re.IGNORECASE)


_COMPLAINT_KEYWORDS = (
    "pain", "hurts", "ache", "swelling", "discomfort", "problem", "complaint",
    "suffering", "severe", "dull", "sharp", "burning", "cramp", "trouble",
    "dard", "takleef", "pareshaani", "jalan", "soojan"
)

_FOLLOWUP_KEYWORDS = (
    "follow up", "follow-up", "come back", "visit again", "see you in", "next week",
    "after 3 days", "after a week", "review after", "next visit", "return if"
)

_ACTION_KEYWORDS = (
    "blood test", "x-ray", "scan", "mri", "ct scan", "ecg", "ekg", "lab test",
    "ultrasound", "investigation", "admit", "refer", "test"
)

_RECOMMENDATION_KEYWORDS = (
    "rest", "drink", "water", "hydrate", "avoid", "diet", "exercise", "sleep",
    "warm water", "ice", "elevate", "caution", "precautions", "care"
)


DEFAULT_LOCAL_SUMMARIZER_MODEL = "Falconsai/medical_summarization"


class LocalClinicalSummarizer(Summarizer):
    def __init__(self, lexicon: MedicalLexicon | None = None, model_name: str | None = None) -> None:
        self._lexicon = lexicon or load_lexicon()
        self._model_name = model_name or os.environ.get("LOCAL_SUMMARIZER_MODEL", DEFAULT_LOCAL_SUMMARIZER_MODEL)
        self._pipe: Any = None
        self._pipe_initialized = False

    def _ensure_pipe_loaded(self) -> bool:
        if self._pipe_initialized:
            return self._pipe is not None
        self._pipe_initialized = True
        try:
            from transformers import pipeline
            import torch

            device = 0 if torch.cuda.is_available() else -1
            self._pipe = pipeline("summarization", model=self._model_name, device=device)
            return True
        except Exception:
            self._pipe = None
            return False

    async def summarize(self, utterances: list[SummaryUtterance]) -> StructuredSummary:
        raw_fields: dict[str, list[dict[str, str]]] = {f: [] for f in _SUMMARY_SCHEMA_FIELDS}

        for u in utterances:
            uid = u.utterance_id
            text = u.translated_text or u.original_text
            text_lower = text.lower()

            # 1. Objective findings (Vitals / Measurements)
            bp_match = _BP_PATTERN.search(text)
            if bp_match and bp_match.group(1):
                raw_fields["objective"].append({
                    "text": f"Blood Pressure recorded at {bp_match.group(1)} mmHg",
                    "source_utterance_id": uid,
                })
            temp_match = _TEMP_PATTERN.search(text)
            if temp_match and temp_match.group(1):
                raw_fields["objective"].append({
                    "text": f"Temperature noted: {temp_match.group(0).strip()}",
                    "source_utterance_id": uid,
                })
            pulse_match = _PULSE_PATTERN.search(text)
            if pulse_match and pulse_match.group(1):
                raw_fields["objective"].append({
                    "text": f"Pulse rate: {pulse_match.group(1)} bpm",
                    "source_utterance_id": uid,
                })
            spo2_match = _SPO2_PATTERN.search(text)
            if spo2_match and spo2_match.group(1):
                raw_fields["objective"].append({
                    "text": f"Oxygen saturation (SpO2): {spo2_match.group(1)}%",
                    "source_utterance_id": uid,
                })

            # 2. Medical Lexicon Matching (Symptoms, Medications, Conditions)
            for term in self._lexicon.terms:
                matched_variants = [v for v in (*term.english, *term.hindi) if v.lower() in text_lower]
                if matched_variants:
                    cat = term.category.lower()
                    if cat == "symptom":
                        raw_fields["symptoms"].append({
                            "text": f"Patient reports {term.canonical} ({term.definition})",
                            "source_utterance_id": uid,
                        })
                    elif cat == "medication":
                        raw_fields["medications"].append({
                            "text": f"Medication mentioned: {term.canonical} ({term.definition})",
                            "source_utterance_id": uid,
                        })
                    elif cat in ("condition", "disease", "diagnosis"):
                        raw_fields["diagnoses_mentioned"].append({
                            "text": f"Condition discussed: {term.canonical} ({term.icd10 or 'clinical note'})",
                            "source_utterance_id": uid,
                        })

            # 3. Patient Complaints
            if any(k in text_lower for k in _COMPLAINT_KEYWORDS):
                raw_fields["complaints"].append({
                    "text": f"Reported complaint: {text.strip()}",
                    "source_utterance_id": uid,
                })

            # 4. Follow-up
            if any(k in text_lower for k in _FOLLOWUP_KEYWORDS):
                raw_fields["follow_up"].append({
                    "text": f"Follow-up instruction: {text.strip()}",
                    "source_utterance_id": uid,
                })

            # 5. Action Items
            if any(k in text_lower for k in _ACTION_KEYWORDS):
                raw_fields["action_items"].append({
                    "text": f"Action plan / test ordered: {text.strip()}",
                    "source_utterance_id": uid,
                })

            # 6. Recommendations
            if any(k in text_lower for k in _RECOMMENDATION_KEYWORDS):
                raw_fields["recommendations"].append({
                    "text": f"Clinical advice / lifestyle: {text.strip()}",
                    "source_utterance_id": uid,
                })

        # If complaints are empty and we have utterances, populate with first patient utterance
        if not raw_fields["complaints"] and utterances:
            first_u = utterances[0]
            first_text = first_u.translated_text or first_u.original_text
            raw_fields["complaints"].append({
                "text": f"Consultation initiated: {first_text.strip()}",
                "source_utterance_id": first_u.utterance_id,
            })

        # Validate all bullets for strict span-grounding
        discarded_total = 0
        field_values: dict[str, list[SummaryBullet]] = {}
        for field in _SUMMARY_SCHEMA_FIELDS:
            # Deduplicate by text within the field
            seen: set[str] = set()
            deduped: list[dict[str, str]] = []
            for b in raw_fields[field]:
                key = (b["text"], b["source_utterance_id"])
                if key not in seen:
                    seen.add(key)
                    deduped.append(b)
            bullets, discarded = validate_bullets(deduped, utterances)
            field_values[field] = bullets
            discarded_total += discarded

        return StructuredSummary(
            patient_info=None,
            discarded_ungrounded_count=discarded_total,
            model_name=self._model_name,
            **field_values,
        )
