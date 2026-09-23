"""In-memory per-session state: consent flag + stateful detectors."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.collapse_detection.detector import collapse_score
from app.confirmation import ConfirmationBuffer
from app.frame_exit_detection.detector import FrameExitDetector
from app.pose.estimator import PoseEstimator
from app.schemas import DetectionResult
from app.stillness_detection.detector import StillnessDetector

_STILL_ALERT_FRAMES = 30  # ~15s at 2fps before stillness alert fires


@dataclass
class SessionState:
    consented: bool = False
    last_alert: DetectionResult | None = None
    _stillness: StillnessDetector = field(default_factory=StillnessDetector)
    _exit: FrameExitDetector = field(default_factory=FrameExitDetector)
    _collapse_buf: ConfirmationBuffer = field(default_factory=ConfirmationBuffer)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def get_or_create(self, session_id: str) -> SessionState:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionState()
        return self._sessions[session_id]

    def set_consent(self, session_id: str, consented: bool) -> None:
        self.get_or_create(session_id).consented = consented

    def analyze(self, session_id: str, jpeg_bytes: bytes, estimator: PoseEstimator) -> DetectionResult:
        state = self.get_or_create(session_id)
        kp = estimator.estimate(jpeg_bytes)
        pose_detected = kp is not None

        score = collapse_score(kp) if kp is not None else 0.0
        still_count = state._stillness.update(kp) if kp is not None else 0
        exited = state._exit.update(pose_detected)
        collapse_confirmed = state._collapse_buf.update(score)

        alert_triggered = False
        alert_reason: str | None = None

        if collapse_confirmed:
            alert_triggered = True
            alert_reason = "Possible collapse detected: head dropped to or below hip level for 3+ consecutive frames."
        elif exited:
            alert_triggered = True
            alert_reason = "Patient appears to have left the camera frame."
        elif still_count >= _STILL_ALERT_FRAMES:
            alert_triggered = True
            alert_reason = f"Patient has been motionless for {still_count} consecutive frames (~{still_count // 2}s)."

        result = DetectionResult(
            session_id=session_id,
            frame_ts=time.time(),
            pose_detected=pose_detected,
            collapse_score=score,
            still_frames=still_count,
            exited_frame=exited,
            alert_triggered=alert_triggered,
            alert_reason=alert_reason,
        )
        if alert_triggered:
            state.last_alert = result
        return result

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


# Module-level singleton; replaced in tests via dependency injection.
_store = SessionStore()


def get_store() -> SessionStore:
    return _store
