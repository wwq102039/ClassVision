"""推理编排：检测 → 特征提取 → 身份比对。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ..core.exceptions import ImageInvalidError
from .detector import DetBox, detector
from .embedder import embedder
from .matcher import CosineMatcher, cosine_similarity


@dataclass
class GalleryItem:
    """底库条目：学生记录 + 已解密的特征向量。"""

    id: int
    embedding: np.ndarray
    record: Any


@dataclass
class FaceResult:
    box: DetBox
    student: Any | None
    similarity: float


def decode_image(data: bytes) -> np.ndarray:
    import cv2

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ImageInvalidError()
    return img


def detect_faces(image: np.ndarray) -> list[DetBox]:
    return detector().detect(image)


class InferenceService:
    def __init__(self, threshold: float | None = None):
        self.matcher = CosineMatcher(threshold)

    def recognize(self, image: np.ndarray, gallery: list[GalleryItem]) -> dict:
        boxes = detect_faces(image)
        if not boxes:
            return {"detected_count": 0, "faces": []}
        embeds = embedder().embed(image, boxes)
        faces: list[FaceResult] = []
        for box, emb in zip(boxes, embeds):
            student = None
            similarity = 0.0
            if emb.size:
                idx = self.matcher.match(emb, gallery)
                if idx is not None:
                    item = gallery[idx]
                    student = item.record
                    similarity = float(cosine_similarity(emb, item.embedding))
            faces.append(FaceResult(box=box, student=student, similarity=similarity))
        return {"detected_count": len(boxes), "faces": faces}