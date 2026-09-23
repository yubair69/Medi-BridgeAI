from fastapi import FastAPI

from app.health import HealthResponse
from app.miscommunication.provider_factory import get_similarity_provider
from app.risk_scoring.hysteresis import RiskHistoryStore
from app.routes.cds import create_cds_router
from app.routes.emergency import create_emergency_router
from app.routes.entities import create_entities_router
from app.routes.hipaa import create_hipaa_router
from app.routes.miscommunication import create_miscommunication_router
from app.routes.risk import create_risk_router
from app.routes.summarization import create_summarization_router
from app.summarization.provider_factory import get_summarizer

SERVICE_NAME = "clinical-nlp"
SERVICE_VERSION = "0.1.0"

app = FastAPI(title=SERVICE_NAME)
app.include_router(create_miscommunication_router(get_similarity_provider))
app.include_router(create_entities_router())
app.include_router(create_emergency_router())
app.include_router(create_summarization_router(get_summarizer))
app.include_router(create_hipaa_router())
app.include_router(create_cds_router())

_risk_store = RiskHistoryStore()
app.include_router(create_risk_router(lambda: _risk_store))


@app.on_event("startup")
async def _warmup() -> None:
    import asyncio, logging
    from concurrent.futures import ThreadPoolExecutor
    log = logging.getLogger(__name__)

    def _load() -> None:
        log.info("loading similarity model in background...")
        try:
            get_similarity_provider()
            log.info("similarity model ready")
        except Exception as exc:
            log.warning("similarity model unavailable at startup: %s", exc)

    asyncio.get_event_loop().run_in_executor(ThreadPoolExecutor(max_workers=1), _load)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=SERVICE_NAME, version=SERVICE_VERSION)
