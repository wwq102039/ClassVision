"""人脸检测器抽象与实现（ONNX 默认 / ultralytics PT 备选）。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from loguru import logger

from ..config import settings
from ..core.exceptions import ModelNotReadyError


@dataclass
class DetBox:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float

    @property
    def xyxy(self) -> tuple[float, float, float, float]:
        return (self.x1, self.y1, self.x2, self.y2)

    def as_list(self) -> list[float]:
        return [self.x1, self.y1, self.x2, self.y2, self.score]


class FaceDetector(Protocol):
    def detect(self, image: np.ndarray) -> list[DetBox]:
        """输入 BGR 图像，返回人脸框列表（像素坐标）。"""


def _letterbox(image: np.ndarray, new_size: int, color=(114, 114, 114)):
    """等比缩放到 new_size 并填充，返回 (img, ratio, pad_left, pad_top)。"""
    import cv2

    h, w = image.shape[:2]
    r = new_size / max(h, w)
    if r != 1:
        new_w, new_h = int(round(w * r)), int(round(h * r))
    else:
        new_w, new_h = w, h
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    pad_w = new_size - new_w
    pad_h = new_size - new_h
    left, top = pad_w // 2, pad_h // 2
    img = cv2.copyMakeBorder(
        resized, top, pad_h - top, left, pad_w - left,
        borderType=cv2.BORDER_CONSTANT, value=color,
    )
    return img, r, left, top


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thres: float) -> list[int]:
    import cv2

    if len(boxes) == 0:
        return []
    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        inds = np.where(iou <= iou_thres)[0]
        order = order[inds + 1]
    _ = cv2  # 占位，保持导入一致性
    return keep


class OnnxDetector:
    """onnxruntime 加载 yolov8n_face.onnx，内置 YOLOv8 head 后处理。"""

    def __init__(self, model_path: str | None = None):
        self.model_path = model_path or str(settings.MODEL_DIR / settings.DETECTOR_MODEL_ONNX)
        self.session = None
        self.input_name = None
        self._load()

    def _load(self) -> None:
        import onnxruntime as ort

        if self.session is None:
            try:
                self.session = ort.InferenceSession(self.model_path, providers=["CPUExecutionProvider"])
            except Exception as exc:  # noqa: BLE001
                raise ModelNotReadyError(f"onnx 模型加载失败: {exc}") from exc
        self.input_name = self.session.get_inputs()[0].name
        logger.info(f"人脸检测器(onnx)就绪: {self.model_path}")

    def detect(self, image: np.ndarray) -> list[DetBox]:
        if self.session is None:
            self._load()
        img, ratio, left, top = _letterbox(image, settings.DETECT_IMG_SIZE)
        blob = img.astype(np.float32) / 255.0
        blob = blob.transpose(2, 0, 1)[None]  # 1,3,H,W
        outputs = self.session.run(None, {self.input_name: blob})
        return self._parse(outputs, ratio, left, top, image)

    def _parse(self, outputs, ratio, left, top, orig) -> list[DetBox]:
        out = outputs[0]
        arr = np.asarray(out)
        # 兼容不同导出形态
        boxes, scores = self._extract_boxes_scores(arr)
        if scores is None:
            return []
        conf = scores[:, 0] if scores.ndim == 2 else scores
        keep_idx = np.where(conf > settings.DETECT_CONF)[0]
        boxes = boxes[keep_idx]
        conf = conf[keep_idx]
        if len(boxes) == 0:
            return []

        # letterbox 坐标还原到原图
        boxes = boxes.astype(np.float32)
        boxes[:, [0, 2]] -= left
        boxes[:, [1, 3]] -= top
        boxes /= ratio

        ih, iw = orig.shape[:2]
        boxes[:, [0, 2]] = np.clip(boxes[:, [0, 2]], 0, iw)
        boxes[:, [1, 3]] = np.clip(boxes[:, [1, 3]], 0, ih)

        keep = _nms(boxes, conf, settings.DETECT_IOU)
        return [DetBox(*boxes[i].tolist(), float(conf[i])) for i in keep]

    @staticmethod
    def _extract_boxes_scores(arr: np.ndarray):
        """解析 YOLOv8 输出为 (boxes_xyxy, scores)，覆盖常见导出形态。

        标准 YOLOv8 导出为 [1, 4+nc, N]（本模型 nc=1 → [1,5,8400]），
        其中 box 为 cxcywh 像素坐标，score 可能已是 sigmoid 概率或原始 logits。
        """
        arr = np.squeeze(arr)
        if arr.ndim == 1:
            arr = arr[None, :]
        if arr.ndim == 3:
            arr = arr[0]
        # 通道在前（如 [5, 8400]）时转置为 [N, C]
        if arr.ndim == 2 and arr.shape[0] < arr.shape[1] and arr.shape[0] <= 6:
            arr = arr.T
        n, c = arr.shape
        if c >= 5:
            cxcywh = arr[:, :4]
            scores = arr[:, 4:]
            # 自适应 sigmoid：出现负值或 >1 说明是 logits
            if scores.min() < 0 or scores.max() > 1:
                scores = 1.0 / (1.0 + np.exp(-scores))
            score = scores.max(axis=1)
            boxes = np.zeros((n, 4), dtype=np.float32)
            boxes[:, 0] = cxcywh[:, 0] - cxcywh[:, 2] / 2
            boxes[:, 1] = cxcywh[:, 1] - cxcywh[:, 3] / 2
            boxes[:, 2] = cxcywh[:, 0] + cxcywh[:, 2] / 2
            boxes[:, 3] = cxcywh[:, 1] + cxcywh[:, 3] / 2
            return boxes, score[:, None]
        elif c == 4:
            return arr, np.ones((n, 1))
        # nms 导出形态（xyxy, score, cls 等）
        return arr[:, :4], arr[:, 4:5]


class UltralyticsDetector:
    """ultralytics 加载 yolov8n_face.pt，作为 PT 后端/调试备选。"""

    def __init__(self, model_path: str | None = None):
        self.model_path = model_path or str(settings.MODEL_DIR / settings.DETECTOR_MODEL_PT)
        self.model = None
        self._load()

    def _load(self) -> None:
        try:
            from ultralytics import YOLO  # noqa: PLC0415
        except ImportError as exc:
            raise ModelNotReadyError("未安装 ultralytics，无法使用 PT 后端") from exc
        try:
            self.model = YOLO(self.model_path)
        except Exception as exc:  # noqa: BLE001
            raise ModelNotReadyError(f"PT 模型加载失败: {exc}") from exc
        logger.info(f"人脸检测器(ultralytics)就绪: {self.model_path}")

    def detect(self, image: np.ndarray) -> list[DetBox]:
        if self.model is None:
            self._load()
        results = self.model.predict(
            image, conf=settings.DETECT_CONF, iou=settings.DETECT_IOU,
            imgsz=settings.DETECT_IMG_SIZE, verbose=False,
        )
        boxes_out: list[DetBox] = []
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                score = float(box.conf[0])
                boxes_out.append(DetBox(x1, y1, x2, y2, score))
        return boxes_out


def get_detector(backend: str | None = None) -> FaceDetector:
    """按配置创建检测器。auto 模式优先 onnx，失败回落 pt。"""
    backend = (backend or settings.DETECTOR_BACKEND).lower()

    candidates: list[tuple[str, type]] = []
    if backend in ("auto", "onnx"):
        candidates.append(("onnx", OnnxDetector))
    if backend in ("auto", "pt"):
        candidates.append(("pt", UltralyticsDetector))

    last_err: Exception | None = None
    for name, cls in candidates:
        try:
            return cls()
        except ModelNotReadyError as exc:
            last_err = exc
            logger.warning(f"检测后端 {name} 不可用: {exc}")
    raise (last_err or ModelNotReadyError("无可用的人脸检测后端"))


_detector: FaceDetector | None = None


def detector() -> FaceDetector:
    """单例检测器。"""
    global _detector
    if _detector is None:
        _detector = get_detector()
    return _detector