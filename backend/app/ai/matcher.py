"""特征比对器：余弦相似度。"""
from __future__ import annotations

import numpy as np

from ..config import settings


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    if a is None or b is None:
        return 0.0
    a = np.asarray(a, dtype=np.float32).ravel()
    b = np.asarray(b, dtype=np.float32).ravel()
    if a.size == 0 or b.size == 0:
        return 0.0
    if a.shape != b.shape:
        return 0.0
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


class CosineMatcher:
    """与底库特征做余弦比对，按阈值判定身份或未识别。"""

    def __init__(self, threshold: float | None = None):
        self.threshold = threshold if threshold is not None else settings.MATCH_THRESHOLD

    def match(self, feature: np.ndarray, gallery: list) -> int | None:
        """gallery 元素具有 .embedding（numpy 数组）与 .id。

        返回最佳匹配的 gallery 下标；均低于阈值返回 None。
        """
        best_idx: int | None = None
        best_score = -1.0
        for i, item in enumerate(gallery):
            emb = getattr(item, "embedding", None)
            score = cosine_similarity(feature, emb)
            if score > best_score:
                best_score = score
                best_idx = i
        if best_idx is None or best_score < self.threshold:
            return None
        return best_idx