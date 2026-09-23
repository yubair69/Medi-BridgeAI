import base64

from fastapi import Depends, FastAPI, HTTPException

from app.health import HealthResponse
from app.pose.provider_factory import get_pose_estimator
from app.schemas import (
    ConsentRequest,
    ConsentResponse,
    DetectionResult,
    DetectionState,
    FrameRequest,
)
from app.session_store import SessionStore, get_store

SERVICE_NAME = "vision-service"
SERVICE_VERSION = "0.2.0"

app = FastAPI(title=SERVICE_NAME)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=SERVICE_NAME, version=SERVICE_VERSION)


@app.post("/sessions/{session_id}/consent", response_model=ConsentResponse)
def set_consent(
    session_id: str,
    body: ConsentRequest,
    store: SessionStore = Depends(get_store),
) -> ConsentResponse:
    store.set_consent(session_id, body.consented)
    return ConsentResponse(session_id=session_id, consented=body.consented)


@app.post("/analyze/frame", response_model=DetectionResult)
def analyze_frame(
    body: FrameRequest,
    store: SessionStore = Depends(get_store),
) -> DetectionResult:
    state = store.get_or_create(body.session_id)
    if not state.consented:
        raise HTTPException(status_code=403, detail="Camera analysis requires explicit consent.")
    try:
        jpeg_bytes = base64.b64decode(body.frame_b64)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="frame_b64 is not valid base64.") from exc
    estimator = get_pose_estimator()
    return store.analyze(body.session_id, jpeg_bytes, estimator)


@app.get("/sessions/{session_id}/detection-state", response_model=DetectionState)
def detection_state(
    session_id: str,
    store: SessionStore = Depends(get_store),
) -> DetectionState:
    state = store.get_or_create(session_id)
    return DetectionState(
        session_id=session_id,
        consented=state.consented,
        last_alert=state.last_alert,
    )
