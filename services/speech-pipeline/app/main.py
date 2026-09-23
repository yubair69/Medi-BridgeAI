from fastapi import FastAPI

from app.asr.provider_factory import get_asr_provider
from app.clinical_nlp.provider_factory import (
    get_emergency_detector,
    get_entity_extractor,
    get_miscommunication_checker,
    get_risk_scorer,
)
from app.diarization.provider_factory import get_embedding_provider
from app.emotion.provider_factory import get_emotion_classifier
from app.health import HealthResponse
from app.mt.provider_factory import get_mt_provider
from app.orchestrator_client_factory import get_orchestrator_client
from app.routes.patient_tts import create_patient_tts_router
from app.routes.transcribe_ws import create_transcribe_router
from app.tts.provider_factory import get_tts_provider

SERVICE_NAME = "speech-pipeline"
SERVICE_VERSION = "0.1.0"

app = FastAPI(title=SERVICE_NAME)


@app.on_event("startup")
async def _warmup() -> None:
    # Warm up providers in a background thread so uvicorn finishes startup
    # immediately and the health endpoint responds while the model downloads.
    # The first WebSocket connection will still have to wait if it arrives
    # before the model finishes loading, but it won't time out — lru_cache
    # means subsequent calls return instantly.
    import asyncio
    import logging
    from concurrent.futures import ThreadPoolExecutor

    log = logging.getLogger(__name__)

    def _load() -> None:
        log.info("loading models in background (may take a minute on first run)...")
        for name, fn in [
            ("ASR", get_asr_provider),
            ("MT", get_mt_provider),
            ("TTS", get_tts_provider),
            ("diarization", get_embedding_provider),
        ]:
            try:
                fn()
                log.info("%s provider ready", name)
            except Exception as exc:
                log.warning("%s provider unavailable at startup: %s", name, exc)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(ThreadPoolExecutor(max_workers=1), _load)


app.include_router(
    create_transcribe_router(
        get_asr_provider,
        get_mt_provider,
        get_tts_provider,
        get_embedding_provider,
        get_miscommunication_checker,
        get_orchestrator_client,
        get_entity_extractor,
        get_emergency_detector,
        get_emotion_classifier,
        get_risk_scorer,
    )
)
app.include_router(create_patient_tts_router(get_tts_provider))


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=SERVICE_NAME, version=SERVICE_VERSION)
