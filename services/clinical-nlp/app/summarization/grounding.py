"""Grounding validation for LLM-proposed summary bullets (Blueprint Section
11.1: "every extracted entity, symptom, and summary bullet must carry a
reference to the exact transcript span it came from. If an LLM-based
extractor cannot produce a valid span match, the item is discarded, not
shown.").

Two checks, both must pass:
1. Structural: `source_utterance_id` must reference an utterance that was
   actually in the transcript sent to the model. A citation to an id that
   doesn't exist (hallucinated or malformed) is an automatic discard --
   this is the primary, strictly-enforced check.
2. Lexical backstop: the bullet's text must have at least some overlap with
   the cited utterance's own text (English translation preferred, since
   bullets are written in English but the source utterance may be Hindi).
   This is a heuristic, not a strong guarantee -- a bullet could cite a
   real utterance_id while still summarizing/paraphrasing it inaccurately
   in a way this simple ratio check wouldn't catch. Real semantic grounding
   verification would need an embedding-similarity call, which is out of
   scope here; documented honestly as a backstop against flagrant
   mismatches (citing utterance A's id while writing content from
   utterance B), not a guarantee against subtle misrepresentation.
"""

from __future__ import annotations

import difflib
from typing import Any

from app.summarization.schemas import SummaryBullet, SummaryUtterance

# Low on purpose -- this only needs to catch citing a completely unrelated
# utterance, not enforce near-verbatim overlap (bullets legitimately
# paraphrase/translate/condense).
MIN_LEXICAL_OVERLAP = 0.10


def validate_bullets(raw_bullets: Any, utterances: list[SummaryUtterance]) -> tuple[list[SummaryBullet], int]:
    """Returns (validated bullets, count discarded). Never raises -- a
    malformed candidate (wrong shape, missing keys) is discarded like any
    other ungrounded one, not a reason to fail the whole summary."""
    by_id = {u.utterance_id: u for u in utterances}
    validated: list[SummaryBullet] = []
    discarded = 0

    if not isinstance(raw_bullets, list):
        return validated, discarded

    for candidate in raw_bullets:
        if not isinstance(candidate, dict):
            discarded += 1
            continue
        text = candidate.get("text")
        source_id = candidate.get("source_utterance_id")
        if not isinstance(text, str) or not text.strip() or not isinstance(source_id, str):
            discarded += 1
            continue

        utterance = by_id.get(source_id)
        if utterance is None:
            discarded += 1
            continue

        # Bullets are written in English; compare against original_text (English)
        # first, falling back to translated_text only if original is absent.
        reference_text = utterance.original_text or utterance.translated_text or ""
        overlap = difflib.SequenceMatcher(None, text.lower(), reference_text.lower()).ratio()
        if overlap < MIN_LEXICAL_OVERLAP:
            discarded += 1
            continue

        validated.append(SummaryBullet(text=text.strip(), source_utterance_id=source_id))

    return validated, discarded
