"""申诉管理路由（教师权限）：列表 + 审核。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...core.response import ok
from ...models.base import get_db
from ...schemas.schemas import AppealReview
from ...services.appeal import list_appeals, review_appeal

router = APIRouter(prefix="/appeals", tags=["申诉"])


@router.get("")
def list_all(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    return ok(list_appeals(db, status))


@router.post("/{appeal_id}/review")
def review(
    appeal_id: int,
    req: AppealReview,
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    review_appeal(db, appeal_id, req.decision, req.comment)
    return ok({"appeal_id": appeal_id, "decision": req.decision})
