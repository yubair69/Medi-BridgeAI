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
        self._exited = False

    def update(self, pose_detected: bool) -> bool:
        """Return True exactly once when exit threshold is first reached; False thereafter until person returns."""
        if pose_detected:
            self._consecutive_no_pose = 0
            self._exited = False
            return False
        self._consecutive_no_pose += 1
        if self._consecutive_no_pose >= self._exit_frames and not self._exited:
            self._exited = True
            return True
        return False

    def reset(self) -> None:
        self._consecutive_no_pose = 0
