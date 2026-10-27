"""人脸库服务：底库构建、批量导入、特征加密存储。"""
from __future__ import annotations

import numpy as np
from loguru import logger
from sqlalchemy.orm import Session

from ..ai.embedder import embedder
from ..ai.inference import GalleryItem, decode_image, detect_faces

from ..core import security
from ..models import Student


def build_gallery(db: Session, class_name: str | None = None) -> list[GalleryItem]:
    """查询已注册人脸特征的学生，解密特征构造比对底库。"""
    query = db.query(Student).filter(Student.face_embedding.isnot(None))
    if class_name:
        query = query.filter(Student.class_name == class_name)
    gallery: list[GalleryItem] = []
    for s in query.all():
        emb = security.decrypt_embedding(s.face_embedding)
        if emb is not None and emb.size:
            gallery.append(GalleryItem(id=s.id, embedding=np.asarray(emb, dtype=np.float32), record=s))
    return gallery


def import_face_file(db: Session, student: Student, image: np.ndarray) -> tuple[bool, str]:
    """单张照片导入：检测 → 特征提取 → 加密落库。成功返回 (True, '')，失败返回 (False, 原因)。"""
    boxes = detect_faces(image)
    if not boxes:
        return False, "未检测到人脸"
    embeds = embedder().embed(image, boxes)
    if not embeds or embeds[0].size == 0:
        return False, "特征提取失败"
    # 优先取置信度最高的人脸（boxes 已按检测顺序，简化取第一个）
    embedding = embeds[0]

    # 加密写特征 + 原图
    import cv2

    ok_flag, jpg = cv2.imencode(".jpg", image)
    if not ok_flag:
        return False, "图像编码失败"
    rel_path = security.encrypt_file(jpg.tobytes(), "faces", ".jpg")
    student.face_embedding = security.encrypt_embedding(embedding)
    student.photo_path = rel_path
    db.add(student)
    db.flush()
    return True, ""