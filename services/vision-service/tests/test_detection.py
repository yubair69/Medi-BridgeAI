"""Phase 8 vision-service tests.

All tests run in MEDIBRIDGE_FIXTURE_MODE (NoPoseEstimator default) or
inject synthetic keypoints directly — no mediapipe download required.
"""

import base64
import os

from fastapi.testclient import TestClient

os.environ.setdefault("MEDIBRIDGE_FIXTURE_MODE", "1")

from app.collapse_detection.detector import collapse_score
from app.confirmation import ConfirmationBuffer
from app.frame_exit_detection.detector import FrameExitDetector
from app.main import app
from app.pose.estimator import Keypoints
from app.pose.fixture_provider import FixturePoseEstimator
from app.session_store import SessionStore
from app.stillness_detection.detector import StillnessDetector

client = TestClient(app)

_BLANK_JPEG = base64.b64encode(b"notreallyjpeg").decode()


# ── unit: collapse scorer ──────────────────────────────────────────────────

def _kp(nose_y: float, hip_y: float = 0.5) -> Keypoints:
    return Keypoints(nose_x=0.5, nose_y=nose_y, left_hip_y=hip_y, right_hip_y=hip_y,
                     left_shoulder_y=0.3, right_shoulder_y=0.3)


def test_collapse_score_normal() -> None:
    # Head well above hips → score near 0
    assert collapse_score(_kp(nose_y=0.1, hip_y=0.6)) == 0.0


def test_collapse_score_full() -> None:
    # Nose at same level as hip → score 1.0
    assert collapse_score(_kp(nose_y=0.6, hip_y=0.6)) == 1.0


def test_collapse_score_partial() -> None:
    # Nose just above hip level → intermediate score
    score = collapse_score(_kp(nose_y=0.595, hip_y=0.6))
    assert 0.0 < score < 1.0


# ── unit: confirmation buffer ─────────────────────────────────────────────

def test_confirmation_buffer_requires_k_consecutive() -> None:
    buf = ConfirmationBuffer(k=3, threshold=0.7)
    assert not buf.update(0.9)
    assert not buf.update(0.9)
    assert buf.update(0.9)  # third consecutive


def test_confirmation_buffer_resets_on_low_score() -> None:
    buf = ConfirmationBuffer(k=3, threshold=0.7)
    buf.update(0.9)
    buf.update(0.9)
    buf.update(0.2)  # reset
    assert not buf.update(0.9)  # count back to 1


# ── unit: frame exit detector ─────────────────────────────────────────────

def test_frame_exit_not_triggered_with_pose() -> None:
    det = FrameExitDetector(exit_frames=3)
    for _ in range(10):
        assert not det.update(True)


def test_frame_exit_triggered_after_threshold() -> None:
    det = FrameExitDetector(exit_frames=3)
    assert not det.update(False)
    assert not det.update(False)
    assert det.update(False)


def test_frame_exit_resets_on_pose() -> None:
    det = FrameExitDetector(exit_frames=3)
    det.update(False)
    det.update(False)
    det.update(True)   # reset
    assert not det.update(False)  # count back to 1


# ── unit: stillness detector ──────────────────────────────────────────────

def test_stillness_zero_when_moving() -> None:
    det = StillnessDetector(window=5)
    ys = [0.1, 0.2, 0.1, 0.3, 0.2]
    for y in ys:
        det.update(Keypoints(nose_x=0.5, nose_y=0.1, left_hip_y=0.5, right_hip_y=0.5,
                             left_shoulder_y=y, right_shoulder_y=y))
    # high variance → 0
    result = det.update(Keypoints(nose_x=0.5, nose_y=0.1, left_hip_y=0.5, right_hip_y=0.5,
                                  left_shoulder_y=0.4, right_shoulder_y=0.4))
    assert result == 0


def test_stillness_nonzero_when_motionless() -> None:
    det = StillnessDetector(window=5)
    for _ in range(6):
        det.update(Keypoints(nose_x=0.5, nose_y=0.1, left_hip_y=0.5, right_hip_y=0.5,
                             left_shoulder_y=0.3000, right_shoulder_y=0.3001))
    # near-zero variance → nonzero still count
    result = det.update(Keypoints(nose_x=0.5, nose_y=0.1, left_hip_y=0.5, right_hip_y=0.5,
                                  left_shoulder_y=0.3000, right_shoulder_y=0.3000))
    assert result > 0


# ── unit: session store with injected estimator ───────────────────────────

def test_analyze_no_pose_no_alert() -> None:
    store = SessionStore()
    store.set_consent("s1", True)
    estimator = FixturePoseEstimator()
    estimator.register(b"frame", None)  # no pose
    result = store.analyze("s1", b"frame", estimator)
    assert not result.alert_triggered
    assert not result.pose_detected


def test_analyze_collapse_triggers_after_k_frames() -> None:
    store = SessionStore()
    store.set_consent("s2", True)
    estimator = FixturePoseEstimator()
    # nose_y >= hip_y → score 1.0 → collapse confirmed after 3 frames
    kp = Keypoints(nose_x=0.5, nose_y=0.6, left_hip_y=0.5, right_hip_y=0.5,
                   left_shoulder_y=0.3, right_shoulder_y=0.3)
    estimator.register(b"frame", kp)
    results = [store.analyze("s2", b"frame", estimator) for _ in range(3)]
    assert results[0].alert_triggered is False
    assert results[1].alert_triggered is False
    assert results[2].alert_triggered is True
    assert results[2].alert_reason is not None
    assert "collapse" in results[2].alert_reason.lower()


# ── integration: API routes ───────────────────────────────────────────────

def test_consent_endpoint_stores_consent() -> None:
    r = client.post("/sessions/test-sess/consent", json={"consented": True})
    assert r.status_code == 200
    assert r.json()["consented"] is True


def test_analyze_frame_rejected_without_consent() -> None:
    r = client.post("/analyze/frame", json={"session_id": "no-consent", "frame_b64": _BLANK_JPEG})
    assert r.status_code == 403


def test_analyze_frame_accepted_with_consent() -> None:
    client.post("/sessions/consented-sess/consent", json={"consented": True})
    r = client.post("/analyze/frame", json={"session_id": "consented-sess", "frame_b64": _BLANK_JPEG})
    # Fixture mode: NoPoseEstimator returns None → no pose, no alert
    assert r.status_code == 200
    body = r.json()
    assert body["pose_detected"] is False
    assert body["alert_triggered"] is False


def test_analyze_frame_bad_base64() -> None:
    client.post("/sessions/bad-b64/consent", json={"consented": True})
    r = client.post("/analyze/frame", json={"session_id": "bad-b64", "frame_b64": "!!notbase64!!"})
    assert r.status_code == 422


def test_detection_state_endpoint() -> None:
    client.post("/sessions/state-sess/consent", json={"consented": True})
    r = client.get("/sessions/state-sess/detection-state")
    assert r.status_code == 200
    body = r.json()
    assert body["consented"] is True
    assert body["last_alert"] is None


def test_detection_state_unknown_session() -> None:
    # Unknown session gets created with defaults
    r = client.get("/sessions/unknown-xyz/detection-state")
    assert r.status_code == 200
    assert r.json()["consented"] is False
