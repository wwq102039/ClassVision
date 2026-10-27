"""多目标人脸跟踪（ReID Tracking）。

每一帧：检测 → 先用 IoU 贪心关联已有轨迹（免特征、覆盖稳态绝大多数帧）→ 仅对
未匹配的检测提取 ReID 特征，与未匹配轨迹做余弦关联（处理新人脸 / 遮挡 / 交叉）
→ 轨迹生命周期管理（出生 / 更新 / 丢失 / 消亡）。轨迹 ID 在帧间保持稳定，
供前端绘制运动轨迹。

稳态下（无新人脸、无交叉遮挡）每帧只做「检测 + IoU」，不提取特征，跟踪速度只随
人脸数线性增长，与特征模型（insightface）解耦。
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .detector import DetBox, detector
from .embedder import embedder
from .matcher import cosine_similarity


def box_iou(a: DetBox, b: DetBox) -> float:
    x1 = max(a.x1, b.x1)
    y1 = max(a.y1, b.y1)
    x2 = min(a.x2, b.x2)
    y2 = min(a.y2, b.y2)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area_a = max(0.0, a.x2 - a.x1) * max(0.0, a.y2 - a.y1)
    area_b = max(0.0, b.x2 - b.x1) * max(0.0, b.y2 - b.y1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


@dataclass
class Tracklet:
    id: int
    box: DetBox
    embedding: np.ndarray
    first_frame: int
    last_frame: int
    missed: int = 0
    hits: int = 1

    def center(self) -> list[float]:
        return [
            round((self.box.x1 + self.box.x2) / 2, 2),
            round((self.box.y1 + self.box.y2) / 2, 2),
        ]


class FaceTracker:
    """单路视频流的人脸跟踪器。实例化后对连续帧调用 update() 即可。"""

    def __init__(
        self,
        iou_confirm_threshold: float = 0.3,
        emb_match_threshold: float = 0.45,
        max_missed: int = 15,
        min_hits: int = 2,
    ):
        self.iou_confirm_threshold = iou_confirm_threshold
        self.emb_match_threshold = emb_match_threshold
        self.max_missed = max_missed
        self.min_hits = min_hits

        self.tracks: dict[int, Tracklet] = {}
        self._next_id = 1
        self._frame = 0
        self.total_created = 0

    def update(self, image: np.ndarray) -> list[dict]:
        self._frame += 1
        boxes = detector().detect(image)
        self._associate(image, boxes)
        self._reap()
        return self.snapshot()

    def _associate(self, image: np.ndarray, boxes: list[DetBox]) -> None:
        candidates = list(self.tracks.values())
        if not candidates:
            embeds = embedder().embed(image, boxes, fast=True) if boxes else []
            for box, emb in zip(boxes, embeds):
                self._spawn(box, emb)
            return

        matched_det: set[int] = set()
        matched_trk: set[int] = set()

        # 第一步：IoU 贪心关联（免特征，稳态每帧只走这里）
        for i, box in enumerate(boxes):
            best_j = -1
            best_iou = self.iou_confirm_threshold
            for j, trk in enumerate(candidates):
                if j in matched_trk:
                    continue
                iou = box_iou(box, trk.box)
                if iou > best_iou:
                    best_iou = iou
                    best_j = j
            if best_j >= 0:
                matched_det.add(i)
                matched_trk.add(best_j)
                self._touch(candidates[best_j], box)

        unmatched_dets = [i for i in range(len(boxes)) if i not in matched_det]
        unmatched_trks = [j for j in range(len(candidates)) if j not in matched_trk]

        used_det: set[int] = set()
        used_trk: set[int] = set()

        if unmatched_dets:
            # 仅对未匹配的检测提取特征（新人脸 / 遮挡 / 交叉），用余弦重识别找回轨迹
            embeds = embedder().embed(image, [boxes[i] for i in unmatched_dets], fast=True)
            pairs: list[tuple[float, int, int]] = []  # (score, det_idx, trk_idx)
            for di, i in enumerate(unmatched_dets):
                emb = embeds[di]
                if emb is None or emb.size == 0:
                    continue
                for tj in unmatched_trks:
                    trk = candidates[tj]
                    if trk.embedding is None or trk.embedding.size == 0:
                        continue
                    sim = cosine_similarity(emb, trk.embedding)
                    if sim >= self.emb_match_threshold:
                        pairs.append((sim, di, tj))

            pairs.sort(key=lambda p: p[0], reverse=True)
            for sim, di, tj in pairs:
                if di in used_det or tj in used_trk:
                    continue
                used_det.add(di)
                used_trk.add(tj)
                trk = candidates[tj]
                self._touch(trk, boxes[unmatched_dets[di]])
                # 指数滑动平均，抑制单帧抖动
                trk.embedding = 0.9 * trk.embedding + 0.1 * embeds[di]

            for di, i in enumerate(unmatched_dets):
                if di not in used_det:
                    self._spawn(boxes[i], embeds[di])

        for j in unmatched_trks:
            if j not in used_trk:
                candidates[j].missed += 1

    def _touch(self, trk: Tracklet, box: DetBox) -> None:
        trk.box = box
        trk.last_frame = self._frame
        trk.missed = 0
        trk.hits += 1

    def _spawn(self, box: DetBox, emb: np.ndarray) -> None:
        self.tracks[self._next_id] = Tracklet(
            id=self._next_id,
            box=box,
            embedding=emb if (emb is not None and emb.size) else np.zeros(0, dtype=np.float32),
            first_frame=self._frame,
            last_frame=self._frame,
        )
        self._next_id += 1
        self.total_created += 1

    def _reap(self) -> None:
        stale = [tid for tid, trk in self.tracks.items() if trk.missed > self.max_missed]
        for tid in stale:
            self.tracks.pop(tid, None)

    def snapshot(self) -> list[dict]:
        """返回当前帧可见且已确认的轨迹，供前端绘制框与运动轨迹。"""
        result: list[dict] = []
        for trk in self.tracks.values():
            if trk.last_frame != self._frame or trk.hits < self.min_hits:
                continue
            result.append(
                {
                    "id": trk.id,
                    "box": [round(v, 2) for v in trk.box.xyxy],
                    "center": trk.center(),
                    "score": round(trk.box.score, 3),
                    "hits": trk.hits,
                }
            )
        result.sort(key=lambda x: x["id"])
        return result

    def summary(self) -> dict:
        active = sum(1 for trk in self.tracks.values() if trk.last_frame == self._frame)
        return {
            "active": active,
            "total_created": self.total_created,
            "alive": len(self.tracks),
            "frame": self._frame,
        }

    def reset(self) -> None:
        self.tracks.clear()
        self._next_id = 1
        self._frame = 0
        self.total_created = 0


_trackers: dict[str, FaceTracker] = {}


def get_tracker(key: str) -> FaceTracker:
    """按会话（session_id）取跟踪器，不存在则新建。"""
    if key not in _trackers:
        _trackers[key] = FaceTracker()
    return _trackers[key]


def reset_tracker(key: str) -> None:
    _trackers.pop(key, None)


def clear_trackers() -> None:
    _trackers.clear()
