"""课程路由。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...core.exceptions import CourseNotFoundError
from ...core.response import ok
from ...models import Appeal, Attendance, ClassSession, Course
from ...models.base import get_db
from ...schemas.schemas import CourseCreate

router = APIRouter(prefix="/courses", tags=["课程"])


def _to_out(c: Course) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "teacher_name": c.teacher_name,
        "schedule_time": c.schedule_time,
        "location": c.location,
        "class_name": c.class_name,
    }


@router.get("")
def list_courses(db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    return ok([_to_out(c) for c in db.query(Course).all()])


@router.post("")
def create_course(req: CourseCreate, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    c = Course(**req.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return ok(_to_out(c))


@router.put("/{course_id}")
def update_course(
    course_id: int, req: CourseCreate, db: Session = Depends(get_db), _: dict = Depends(require_teacher)
):
    c = db.get(Course, course_id)
    if c is None:
        raise CourseNotFoundError()
    c.name = req.name
    c.teacher_name = req.teacher_name
    c.schedule_time = req.schedule_time
    c.location = req.location
    c.class_name = req.class_name
    db.commit()
    db.refresh(c)
    return ok(_to_out(c))


@router.delete("/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    c = db.get(Course, course_id)
    if c is None:
        raise CourseNotFoundError()
    db.query(Attendance).filter(Attendance.course_id == course_id).delete()
    db.query(Appeal).filter(Appeal.course_id == course_id).delete()
    db.query(ClassSession).filter(ClassSession.course_id == course_id).delete()
    db.delete(c)
    db.commit()
    return ok({"deleted": course_id})