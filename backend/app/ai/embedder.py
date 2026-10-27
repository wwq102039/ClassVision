"""人脸特征提取器抽象与实现（insightface 默认 / face_recognition / 降级备选）。"""
from __future__ import annotations

from typing import Protocol

import numpy as np
from loguru import logger

from ..config import settings
from ..core.exceptions import ModelNotReadyError
from .detector import DetBox


class FaceEmbedder(Protocol):
    def embed(self, image: np.ndarray, boxes: list[DetBox], fast: bool = False) -> list[np.ndarray]:
        """对图像中给定人脸框裁剪并提取特征向量，与 boxes 一一对应。

        fast=True 时跳过 insightface 内部的对齐/重检测，直接缩放识别，
        用于实时跟踪等对速度敏感的连续帧场景（YOLO 已给出框）。
        """


def _crop_face(image: np.ndarray, box: DetBox, margin: float = 0.2) -> np.ndarray:
    ih, iw = image.shape[:2]
    x1, y1, x2, y2 = box.x1, box.y1, box.x2, box.y2
    w, h = x2 - x1, y2 - y1
    mx, my = margin * w, margin * h
    x1 = max(0, int(x1 - mx))
    y1 = max(0, int(y1 - my))
    x2 = min(iw, int(x2 + mx))
    y2 = min(ih, int(y2 + my))
    if x2 <= x1 or y2 <= y1:
        return image[int(box.y1):int(box.y2), int(box.x1):int(box.x2)]
    return image[y1:y2, x1:x2]


class InsightFaceEmbedder:
    """insightface FaceAnalysis（detection + recognition）。默认后端。"""

    def __init__(self):
        self.app = None
        self._load()

    def _load(self) -> None:
        try:
            from insightface.app import FaceAnalysis  # noqa: PLC0415
        except ImportError as exc:
            raise ModelNotReadyError("未安装 insightface") from exc
        try:
            self.app = FaceAnalysis(name="buffalo_l")
            self.app.prepare(ctx_id=-1, det_size=(640, 640))
        except Exception as exc:  # noqa: BLE001
            raise ModelNotReadyError(f"insightface 模型加载失败: {exc}") from exc
        logger.info("人脸特征提取器(insightface)就绪")

    def embed(self, image: np.ndarray, boxes: list[DetBox], fast: bool = False) -> list[np.ndarray]:
        if self.app is None:
            self._load()
        embeds: list[np.ndarray] = []
        for box in boxes:
            emb = self._embed_one(image, box, fast=fast)
            embeds.append(emb)
        return embeds

    def _embed_one(self, image: np.ndarray, box: DetBox, fast: bool = False) -> np.ndarray:
        crop = _crop_face(image, box)
        rec = self.app.models.get("recognition")
        if fast and rec is not None:
            # 快速路径：直接缩放识别（YOLO 已给出框，跳过 SCRFD 重检测与对齐）
            feat = rec.get_feat(crop)
            return np.asarray(feat, dtype=np.float32).ravel()
        faces = self.app.get(crop)
        if faces:
            emb = getattr(faces[0], "normed_embedding", None)
            if emb is not None and len(emb) > 0:
                return np.asarray(emb, dtype=np.float32).ravel()
        # 兜底：缩放对齐后用 rec 模型
        if rec is not None:
            feat = rec.get_feat(crop)
            return np.asarray(feat, dtype=np.float32).ravel()
        return np.zeros(0, dtype=np.float32)


class FaceRecognitionEmbedder:
    """face_recognition（dlib）备选后端。"""

    def __init__(self):
        try:
            import face_recognition  # noqa: PLC0415,F401
        except ImportError as exc:
            raise ModelNotReadyError("未安装 face_recognition") from exc
        self.fr = __import__("face_recognition")
        logger.info("人脸特征提取器(face_recognition)就绪")

    def embed(self, image: np.ndarray, boxes: list[DetBox], fast: bool = False) -> list[np.ndarray]:
        rgb = image[:, :, ::-1]  # BGR → RGB
        locations = [(int(b.y1), int(b.x2), int(b.y2), int(b.x1)) for b in boxes]  # top,right,bottom,left
        encodings = self.fr.face_encodings(rgb, known_face_locations=locations)
        result: list[np.ndarray] = []
        for i, box in enumerate(boxes):
            if i < len(encodings):
                result.append(np.asarray(encodings[i], dtype=np.float32))
            else:
                result.append(np.zeros(0, dtype=np.float32))
        return result


class FallbackEmbedder:
    """无外部模型的降级特征提取：灰度缩略向量，仅保证流程可跑通。"""

    def embed(self, image: np.ndarray, boxes: list[DetBox], fast: bool = False) -> list[np.ndarray]:
        import cv2

        result: list[np.ndarray] = []
        for box in boxes:
            crop = _crop_face(image, box)
            if crop.size == 0:
                result.append(np.zeros(0, dtype=np.float32))
                continue
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            small = cv2.resize(gray, (32, 32))
            vec = small.astype(np.float32) / 255.0
            norm = np.linalg.norm(vec) + 1e-6
            result.append(vec.ravel() / norm)
        return result


def get_embedder(backend: str | None = None) -> FaceEmbedder:
    backend = (backend or settings.EMBEDDER_BACKEND).lower()

    candidates: list[tuple[str, type]] = []
    if backend in ("auto", "insightface"):
        candidates.append(("insightface", InsightFaceEmbedder))
    if backend in ("auto", "face_recognition"):
        candidates.append(("face_recognition", FaceRecognitionEmbedder))
    # 始终以 Fallback 兜底，保证流程可运行
    candidates.append(("fallback", FallbackEmbedder))

    last_err: Exception | None = None
    use_fallback = False
    for name, cls in candidates:
        try:
            return cls()
        except ModelNotReadyError as exc:
            last_err = exc
            if name == "fallback":
                use_fallback = True
            logger.warning(f"特征后端 {name} 不可用: {exc}")
    if use_fallback:
        return FallbackEmbedder()
    raise (last_err or ModelNotReadyError("无可用的人脸特征提取后端"))


_embedder: FaceEmbedder | None = None


def embedder() -> FaceEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = get_embedder()
    return _embedder