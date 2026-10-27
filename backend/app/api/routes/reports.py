"""报表路由：Excel 导出。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...models.base import get_db
from ...services.report import export_excel
import io

router = APIRouter(prefix="/reports", tags=["报表"])


@router.get("/export")
def export(
    class_name: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    course_id: int | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    content = export_excel(db, class_name, date_from, date_to, course_id)
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=attendance_report.xlsx"},
    )