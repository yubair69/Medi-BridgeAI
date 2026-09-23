"""Tracks consecutive frames with no detected pose.

When count reaches the threshold, the patient is considered to have
left the frame.
"""

from __future__ import annotations

_EXIT_FRAMES = 5  # consecutive no-pose frames before exit is declared


class FrameExitDetector:
    def __init__(self, exit_frames: int = _EXIT_FRAMES) -> None:
        self._exit_frames = exit_frames
        self._consecutive_no_pose = 0

    def update(self, pose_detected: bool) -> bool:
        """Return True once exit threshold is reached."""
        if pose_detected:
            self._consecutive_no_pose = 0
            return False
        self._consecutive_no_pose += 1
        return self._consecutive_no_pose >= self._exit_frames

    def reset(self) -> None:
        self._consecutive_no_pose = 0
