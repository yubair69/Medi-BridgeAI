"""Local Neural Clinical NER Provider using Hugging Face Transformers.

Default model: `d4data/biomedical-ner-all` (fine-tuned RoBERTa model with 84 biomedical
entity classes including Disease_disorder, Sign_symptom, Medication, Dosage, etc.).
Alternative models: `samrawal/bert-base-uncased_clinical-ner` or custom HF checkpoints.

Runs on GPU (CUDA) when available on Kaggle. Imports transformers lazily so lightweight
dev/test environments operate with zero downloads.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.lexicons.loader import EntityCategory
from app.ner.schemas import MedicalEntity

logger = logging.getLogger(__name__)

DEFAULT_NER_MODEL = "d4data/biomedical-ner-all"

# Map fine-grained biomedical classes to MediBridge EntityCategory
_CATEGORY_MAPPING: dict[str, EntityCategory] = {
    "sign_symptom": "symptom",
    "symptom": "symptom",
    "disease_disorder": "disease",
    "disease": "disease",
    "medication": "medication",
    "dosage": "medication",
    "diagnostic_procedure": "procedure",
    "procedure": "procedure",
    "vital_sign": "vital_sign",
    "biological_structure": "symptom",
}


class NeuralClinicalNERProvider:
    def __init__(self, model_name: str | None = None) -> None:
        self._model_name = model_name or os.environ.get("CLINICAL_NER_MODEL", DEFAULT_NER_MODEL)
        self._pipe: Any = None
        self._initialized = False

    def _ensure_loaded(self) -> bool:
        if self._initialized:
            return self._pipe is not None
        self._initialized = True
        try:
            from transformers import pipeline
            import torch

            device = 0 if torch.cuda.is_available() else -1
            self._pipe = pipeline(
                "token-classification",
                model=self._model_name,
                aggregation_strategy="simple",
                device=device,
            )
            logger.info("Loaded Neural Clinical NER model: %s on device: %s", self._model_name, device)
            return True
        except Exception as exc:
            logger.warning("Neural NER model (%s) not loaded: %s; relying on deterministic lexicon.", self._model_name, exc)
            self._pipe = None
            return False

    def extract(self, text: str) -> list[MedicalEntity]:
        if not text or not text.strip():
            return []
        if not self._ensure_loaded() or self._pipe is None:
            return []

        try:
            results = self._pipe(text)
        except Exception as exc:
            logger.warning("Neural NER inference failed: %s", exc)
            return []

        entities: list[MedicalEntity] = []
        for r in results:
            raw_group = str(r.get("entity_group", "")).lower()
            category = _CATEGORY_MAPPING.get(raw_group)
            if not category:
                # If not explicitly mapped, check substrings
                if "symptom" in raw_group or "sign" in raw_group:
                    category = "symptom"
                elif "disease" in raw_group or "disorder" in raw_group:
                    category = "disease"
                elif "med" in raw_group or "drug" in raw_group or "dose" in raw_group:
                    category = "medication"
                else:
                    continue

            word = str(r.get("word", "")).strip()
            clean_word = word.lstrip("#").strip()
            # Discard subword fragments, numbers, or short words
            if len(clean_word) < 3 or clean_word.isdigit():
                continue
            # RoBERTa biomedical model operates on English; discard isolated non-Latin script artifacts
            if not any(c.isalpha() and c.isascii() for c in clean_word):
                continue

            score = float(r.get("score", 0.8))
            start = int(r.get("start", 0))
            end = int(r.get("end", start + len(word)))
            entity_text = text[start:end] if 0 <= start < end <= len(text) else clean_word
            if len(entity_text.strip()) < 3:
                continue


            entities.append(
                MedicalEntity(
                    text=text[start:end] if 0 <= start < end <= len(text) else word,
                    category=category,
                    canonical_name=word.capitalize(),
                    canonical_code=None,
                    definition=f"Extracted by {self._model_name} ({raw_group})",
                    confidence=score,
                    start_char=start,
                    end_char=end,
                    is_fuzzy_match=False,
                )
            )

        return entities


_DEFAULT_NEURAL_NER: NeuralClinicalNERProvider | None = None


def get_neural_ner_provider() -> NeuralClinicalNERProvider:
    global _DEFAULT_NEURAL_NER
    if _DEFAULT_NEURAL_NER is None:
        _DEFAULT_NEURAL_NER = NeuralClinicalNERProvider()
    return _DEFAULT_NEURAL_NER
