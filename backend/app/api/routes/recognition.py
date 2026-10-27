"""识别路由：课堂识别签到 + 纯人脸检测。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...core.response import ok
from ...models.base import get_db
from ...services.attendance import recognize_and_checkin
from ...ai.inference import decode_image, detect_faces
from ...ai.tracker import get_tracker, reset_tracker

router = APIRouter(prefix="/recognition", tags=["识别"])


@router.post("/recognize")
async def recognize(
    session_id: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    content = await image.read()
    result = recognize_and_checkin(db, session_id, content)
    return ok(result)


@router.post("/detect")
async def detect(
    image: UploadFile = File(...),
    _: dict = Depends(require_teacher),
):
    content = await image.read()
    img = decode_image(content)
    boxes = detect_faces(img)
    return ok(
        {
            "count": len(boxes),
            "boxes": [b.as_list() for b in boxes],
        }
    )


@router.post("/track")
async def track(
    session_id: int = Form(...),
    image: UploadFile = File(...),
    _: dict = Depends(require_teacher),
):
    content = await image.read()
    img = decode_image(content)
    tracker = get_tracker(str(session_id))
    tracked = tracker.update(img)
    return ok(
        {
            "count": len(tracked),
            "tracks": tracked,
            **tracker.summary(),
        }
    )


@router.post("/track/reset")
async def track_reset(
    session_id: int = Form(...),
    _: dict = Depends(require_teacher),
):
    reset_tracker(str(session_id))
    return ok({"reset": True})