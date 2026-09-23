"""Multi-frame confirmation buffer.

Fires only after K consecutive frames exceed a threshold — prevents
single-frame false positives (e.g. a patient bending to tie a shoe).
"""

from __future__ import annotations

# ponytail: fixed K=3, make configurable when false-positive rate measured
_DEFAULT_K = 3


class ConfirmationBuffer:
    def __init__(self, k: int = _DEFAULT_K, threshold: float = 0.7) -> None:
        self._k = k
        self._threshold = threshold
        self._consecutive = 0

    def update(self, score: float) -> bool:
        """Return True once K consecutive frames exceed threshold."""
        if score >= self._threshold:
            self._consecutive += 1
        else:
            self._consecutive = 0
        return self._consecutive >= self._k

    def reset(self) -> None:
        self._consecutive = 0
