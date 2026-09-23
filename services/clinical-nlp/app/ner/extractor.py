"""Deterministic lexicon-matching entity extractor (Blueprint Section
2.2/11.1) -- not a statistical/neural NER model. Real Hindi-capable clinical
NER models are essentially nonexistent (med7/spaCy clinical models are
English-only), and the blueprint's own safety section (11.1) argues for
deterministic lexicon matching over an ML model for exactly this kind of
extraction anyway: trivial span-grounding, fully auditable, and it
fuzzy-matches misspellings/mispronunciations rather than silently dropping
them (Section 12.1's explicit test case) instead of risking a model
hallucinating a mention that was never actually said.

Uses stdlib difflib rather than a fuzzy-matching library (rapidfuzz etc.)
to avoid a new dependency for what a ~40-term lexicon over short utterances
doesn't need better-than-stdlib performance for.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from typing import Any

from app.lexicons.loader import MedicalLexicon
from app.ner.schemas import MedicalEntity

# Below this ratio, a candidate window is not considered a match at all.
# Not tuned against a labeled gold set yet -- qualitative starting point,
# same caveat as every other threshold introduced this build (diarization
# clustering, miscommunication similarity).
FUZZY_MATCH_THRESHOLD = 0.82

_WORD_PATTERN = re.compile(r"\S+")
_MAX_VARIANT_WORDS = 4  # longest lexicon variant is a handful of words; bounds the scan


@dataclass
class _Token:
    text: str
    start: int
    end: int


def _tokenize(text: str) -> list[_Token]:
    return [_Token(m.group(), m.start(), m.end()) for m in _WORD_PATTERN.finditer(text)]


def _similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


def extract_entities(
    text: str,
    lexicon: MedicalLexicon,
    neural_provider: Any = None,
) -> list[MedicalEntity]:
    tokens = _tokenize(text)
    candidates: list[MedicalEntity] = []

    for term in lexicon.terms:
        for variant in (*term.hindi, *term.english):
            variant_len = min(len(variant.split()), _MAX_VARIANT_WORDS)
            for i in range(max(0, len(tokens) - variant_len + 1)):
                window = tokens[i : i + variant_len]
                if not window:
                    continue
                window_text = text[window[0].start : window[-1].end]
                ratio = _similarity(window_text.lower(), variant.lower())
                if ratio < FUZZY_MATCH_THRESHOLD:
                    continue
                candidates.append(
                    MedicalEntity(
                        text=window_text,
                        category=term.category,
                        canonical_name=term.canonical,
                        canonical_code=term.icd10,
                        definition=term.definition,
                        confidence=ratio,
                        start_char=window[0].start,
                        end_char=window[-1].end,
                        is_fuzzy_match=ratio < 1.0,
                    )
                )

    if neural_provider is not None:
        try:
            neural_entities = neural_provider.extract(text)
            candidates.extend(neural_entities)
        except Exception:
            pass

    return _resolve_overlaps(candidates)


def _resolve_overlaps(candidates: list[MedicalEntity]) -> list[MedicalEntity]:
    """Keeps the highest-confidence (then longest) match for any span
    overlapped by multiple candidates, so the same words are never tagged
    as two different entities at once."""
    ordered = sorted(candidates, key=lambda e: (-e.confidence, -(e.end_char - e.start_char)))
    accepted: list[MedicalEntity] = []
    occupied: list[tuple[int, int]] = []

    for candidate in ordered:
        if any(candidate.start_char < end and start < candidate.end_char for start, end in occupied):
            continue
        accepted.append(candidate)
        occupied.append((candidate.start_char, candidate.end_char))

    return sorted(accepted, key=lambda e: e.start_char)
