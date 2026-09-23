from __future__ import annotations

import os
from functools import lru_cache

from app.pose.estimator import PoseEstimator


@lru_cache(maxsize=1)
def get_pose_estimator() -> PoseEstimator:
    if os.environ.get("MEDIBRIDGE_FIXTURE_MODE") == "1":
        from app.pose.fixture_provider import FixturePoseEstimator

        return FixturePoseEstimator()

    from app.pose.estimator import MediapipePoseEstimator

    return MediapipePoseEstimator()
