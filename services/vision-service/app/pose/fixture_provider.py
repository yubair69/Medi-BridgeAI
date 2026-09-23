"""Test double: returns keypoints registered by exact jpeg bytes, or None."""

from __future__ import annotations

from app.pose.estimator import Keypoints, PoseEstimator


class FixturePoseEstimator:
    def __init__(self, fixtures: dict[bytes, Keypoints | None] | None = None) -> None:
        self._fixtures: dict[bytes, Keypoints | None] = fixtures or {}

    def register(self, jpeg_bytes: bytes, keypoints: Keypoints | None) -> None:
        self._fixtures[jpeg_bytes] = keypoints

    def estimate(self, jpeg_bytes: bytes) -> Keypoints | None:
        return self._fixtures.get(jpeg_bytes)


class NoPoseEstimator:
    """Always returns None — simulates a frame with no visible person.
    Used as the default fixture-mode provider when no specific fixtures needed."""

    def estimate(self, jpeg_bytes: bytes) -> Keypoints | None:
        return None


# Make NoPoseEstimator satisfy the PoseEstimator Protocol
_: PoseEstimator = NoPoseEstimator()
