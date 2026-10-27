"""课堂记录路由：列表/创建 + 实时监控 + 热力图。"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...core.exceptions import SessionNotFoundError
from ...core.response import ok
from ...models import Appeal, Attendance, ClassSession, Course, Student
from ...models.base import get_db
from ...schemas.schemas import SessionCreate
from ...services.attendance import monitor

router = APIRouter(prefix="/sessions", tags=["课堂"])


def _to_out(s: ClassSession, course: Course | None = None) -> dict:
    return {
        "id": s.id,
        "course_id": s.course_id,
        "course_name": course.name if course else None,
        "session_date": s.session_date.isoformat() if s.session_date else None,
        "expected_count": s.expected_count,
        "actual_count": s.actual_count,
        "quality_score": s.quality_score,
        "status": s.status,
    }


@router.get("")
def list_sessions(db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    items = db.query(ClassSession).order_by(ClassSession.id.desc()).all()
    courses = {c.id: c for c in db.query(Course).all()}
    return ok([_to_out(s, courses.get(s.course_id)) for s in items])


@router.post("")
def create_session(req: SessionCreate, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    course = db.get(Course, req.course_id)
    if course is None:
        raise SessionNotFoundError("课程不存在")
    expected = db.query(Student).filter(Student.class_name == course.class_name).count()
    session_date = req.session_date or dt.date.today()
    s = ClassSession(
        course_id=course.id,
        session_date=session_date,
        expected_count=expected,
        status="scheduled",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return ok(_to_out(s, course))


@router.get("/{session_id}/monitor")
def get_monitor(session_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    return ok(monitor(db, session_id))


@router.get("/{session_id}/heatmap")
def get_heatmap(session_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    """课堂区域人数热力（匿名，仅返回区域计数）。"""
    session = db.get(ClassSession, session_id)
    if session is None:
        raise SessionNotFoundError()
    if session.status == "finished":
        return ok({"available": False, "message": "课堂已结束"})
    # MVP：基于实到人数的简单区域分布（前/中/后三区近似）
    actual = session.actual_count
    grid = {
        "前排": int(actual * 0.4),
        "中排": int(actual * 0.35),
        "后排": max(0, actual - int(actual * 0.4) - int(actual * 0.35)),
    }
    return ok({"available": True, "session_id": session.id, "grid": grid})


@router.post("/{session_id}/end")
def end_session(session_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    session = db.get(ClassSession, session_id)
    if session is None:
        raise SessionNotFoundError()
    session.status = "finished"
    db.commit()
    return ok({"session_id": session_id, "status": "finished"})


@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    session = db.get(ClassSession, session_id)
    if session is None:
        raise SessionNotFoundError()
    db.query(Attendance).filter(Attendance.session_id == session_id).delete()
    db.query(Appeal).filter(Appeal.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return ok({"deleted": session_id})