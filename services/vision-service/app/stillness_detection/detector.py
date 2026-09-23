"""Per-session stillness tracker.

Maintains a short rolling window of shoulder-y positions. If the
variance across the window is below the threshold, the person is
considered motionless.
"""

from __future__ import annotations

from collections import deque

from app.pose.estimator import Keypoints

_WINDOW = 10          # frames
_VARIANCE_THRESHOLD = 0.0002  # empirical; ~2mm of movement in normalized coords


class StillnessDetector:
    def __init__(self, window: int = _WINDOW, threshold: float = _VARIANCE_THRESHOLD) -> None:
        self._buf: deque[float] = deque(maxlen=window)
        self._window = window
        self._threshold = threshold

    def update(self, kp: Keypoints) -> int:
        """Push a new keypoint observation. Returns consecutive-still-frames count."""
        self._buf.append(kp.shoulder_y())
        if len(self._buf) < 2:
            return 0
        mean = sum(self._buf) / len(self._buf)
        variance = sum((v - mean) ** 2 for v in self._buf) / len(self._buf)
        if variance < self._threshold:
            # All frames in buffer are still; report buffer length as count.
            return len(self._buf)
        return 0

    def reset(self) -> None:
        self._buf.clear()
