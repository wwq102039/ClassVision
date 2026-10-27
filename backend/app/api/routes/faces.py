"""人脸库批量导入路由（教师权限）。"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...core.exceptions import MappingInvalidError, StudentNotFoundError
from ...core.response import ok
from ...models import Student
from ...models.base import get_db
from ...services.face import import_face_file
from ...ai.inference import decode_image

router = APIRouter(prefix="/faces", tags=["人脸库"])


@router.post("/import")
async def import_faces(
    mapping: str = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    try:
        mapping_list: list[dict[str, Any]] = json.loads(mapping)
    except (json.JSONDecodeError, TypeError) as exc:
        raise MappingInvalidError("mapping 需为合法 JSON 数组") from exc

    # 按文件名建立映射（同名可覆盖）
    file_to_student: dict[str, str] = {}
    for m in mapping_list:
        if "student_no" in m and "filename" in m:
            file_to_student[m["filename"]] = m["student_no"]

    succeeded: list[dict] = []
    failed: list[dict] = []

    for f in files:
        filename = f.filename or ""
        student_no = file_to_student.get(filename)
        if student_no is None:
            failed.append({"filename": filename, "reason": "未在 mapping 中匹配到该文件"})
            continue
        student = db.query(Student).filter(Student.student_no == student_no).first()
        if student is None:
            failed.append({"student_no": student_no, "filename": filename, "reason": "学生不存在"})
            continue
        content = await f.read()
        try:
            image = decode_image(content)
        except Exception:  # noqa: BLE001
            failed.append({"student_no": student_no, "filename": filename, "reason": "图像无效"})
            continue
        success, reason = import_face_file(db, student, image)
        if success:
            succeeded.append({"student_no": student_no, "filename": filename})
        else:
            failed.append({"student_no": student_no, "filename": filename, "reason": reason})

    db.commit()
    return ok({"succeeded": succeeded, "failed": failed})