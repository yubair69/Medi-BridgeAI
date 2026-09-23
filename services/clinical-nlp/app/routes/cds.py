"""HTTP endpoints for Clinical Decision Support (CDS): DDI & Allergy Safety."""

from __future__ import annotations

from fastapi import APIRouter

from app.cds.ddi_checker import evaluate_cds
from app.cds.schemas import CdsCheckRequest, CdsCheckResponse


def create_cds_router() -> APIRouter:
    router = APIRouter()

    @router.post("/cds/check-interactions", response_model=CdsCheckResponse)
    async def check_interactions(request: CdsCheckRequest) -> CdsCheckResponse:
        return evaluate_cds(request)

    return router
