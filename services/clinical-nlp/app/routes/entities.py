"""HTTP endpoint for lexicon-based entity extraction (Blueprint Section
2.2). Unlike the miscommunication-check route, there's no injectable
provider here -- lexicon matching is local, deterministic, and has no
"model unavailable" failure mode, so there's nothing to swap or degrade.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.lexicons.loader import load_lexicon
from app.ner.extractor import extract_entities
from app.ner.neural_ner_provider import get_neural_ner_provider
from app.ner.schemas import EntityExtractionRequest, EntityExtractionResponse


def create_entities_router() -> APIRouter:
    router = APIRouter()

    @router.post("/entities/extract", response_model=EntityExtractionResponse)
    def extract(request: EntityExtractionRequest) -> EntityExtractionResponse:
        lexicon = load_lexicon()
        neural_provider = get_neural_ner_provider()
        entities = extract_entities(request.text, lexicon, neural_provider)
        return EntityExtractionResponse(entities=entities, lexicon_version=lexicon.version)

    return router
