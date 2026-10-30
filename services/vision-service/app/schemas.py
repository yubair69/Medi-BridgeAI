from __future__ import annotations

from pydantic import BaseModel


class DetectionResult(BaseModel):
    model_config = {"strict": True}

    session_id: str
    frame_ts: float
    pose_detected: bool
    collapse_score: float  # 0.0–1.0; >0.7 = collapse candidate
    still_frames: int      # consecutive frames with negligible movement
    exited_frame: bool     # no pose detected for N consecutive frames
    alert_triggered: bool
    alert_reason: str | None
    face_cx: float | None  # normalized 0-1 face center x (nose_x)
    face_cy: float | None  # normalized 0-1 face center y (nose_y)


class ConsentRequest(BaseModel):
    model_config = {"strict": True}
    consented: bool


class ConsentResponse(BaseModel):
    model_config = {"strict": True}
    session_id: str
    consented: bool


class FrameRequest(BaseModel):
    model_config = {"strict": True}
    session_id: str
    frame_b64: str  # base64-encoded JPEG


class DetectionState(BaseModel):
    model_config = {"strict": True}
    session_id: str
    consented: bool
    last_alert: DetectionResult | None
