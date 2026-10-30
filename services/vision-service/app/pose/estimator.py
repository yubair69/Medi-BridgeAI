"""Pose keypoint extraction. Protocol-based so tests can inject fixture
keypoints without importing mediapipe."""

from __future__ import annotations

from typing import Protocol


class Keypoints:
    """Normalized (0-1) x/y positions for the landmarks we care about."""

    __slots__ = ("nose_x", "nose_y", "left_hip_y", "right_hip_y", "left_shoulder_y", "right_shoulder_y")

    def __init__(
        self,
        nose_x: float,
        nose_y: float,
        left_hip_y: float,
        right_hip_y: float,
        left_shoulder_y: float,
        right_shoulder_y: float,
    ) -> None:
        self.nose_x = nose_x
        self.nose_y = nose_y
        self.left_hip_y = left_hip_y
        self.right_hip_y = right_hip_y
        self.left_shoulder_y = left_shoulder_y
        self.right_shoulder_y = right_shoulder_y

    def hip_y(self) -> float:
        return (self.left_hip_y + self.right_hip_y) / 2

    def shoulder_y(self) -> float:
        return (self.left_shoulder_y + self.right_shoulder_y) / 2


class PoseEstimator(Protocol):
    def estimate(self, jpeg_bytes: bytes) -> Keypoints | None:
        """Return Keypoints or None if no person detected."""
        ...


class MediapipePoseEstimator:
    """Real estimator backed by mediapipe Pose (STATIC_IMAGE_MODE=True for
    per-frame use; no temporal smoothing since we do that ourselves)."""

    def __init__(self) -> None:
        import mediapipe as mp
        import numpy as np

        self._np = np
        self._mp_pose = mp.solutions.pose
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=True,
            model_complexity=0,  # fastest; good enough for collapse detection
            min_detection_confidence=0.5,
        )

    def estimate(self, jpeg_bytes: bytes) -> Keypoints | None:
        import numpy as np

        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        import cv2

        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = self._pose.process(rgb)
        if not result.pose_landmarks:
            return None
        lm = result.pose_landmarks.landmark
        L = self._mp_pose.PoseLandmark
        return Keypoints(
            nose_x=lm[L.NOSE].x,
            nose_y=lm[L.NOSE].y,
            left_hip_y=lm[L.LEFT_HIP].y,
            right_hip_y=lm[L.RIGHT_HIP].y,
            left_shoulder_y=lm[L.LEFT_SHOULDER].y,
            right_shoulder_y=lm[L.RIGHT_SHOULDER].y,
        )
