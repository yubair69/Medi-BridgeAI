"""Stateless per-frame collapse scorer.

A collapse is inferred when the head (nose) drops below or near the hip
line — i.e. nose_y > hip_y in normalized coords (y increases downward).
Score is a continuous value; callers threshold it (default: >0.7).
"""

from __future__ import annotations

from app.pose.estimator import Keypoints

_COLLAPSE_THRESHOLD = 0.05  # nose must be within 5% of hip level to score 1.0


def collapse_score(kp: Keypoints) -> float:
    """Return 0.0–1.0. 1.0 = head at or below hip level (strong collapse signal)."""
    hip = kp.hip_y()
    # In normalized coords, larger y = lower in frame.
    # If nose_y >= hip_y the head has dropped to/below hips.
    delta = kp.nose_y - hip
    if delta >= 0:
        return 1.0
    # delta is negative (head above hips, normal). Scale: 0 at threshold, 1 at 0.
    score = 1.0 + delta / _COLLAPSE_THRESHOLD
    return max(0.0, min(1.0, score))
