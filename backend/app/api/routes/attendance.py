"""考勤路由：我的汇总（学生）、明细（教师）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from ...api.deps import get_current_student, require_teacher
from ...core.response import ok
from ...models import Attendance, Course, Student
from ...models.base import get_db
from ...schemas.schemas import AppealCreate
from ...services.attendance import my_attendance

router = APIRouter(prefix="/attendance", tags=["考勤"])


@router.get("/mine")
def mine(
    course_id: int | None = None,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    return ok(my_attendance(db, student, course_id))


@router.get("/checkin/sessions")
def checkin_sessions(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    from ...services.attendance import checkin_sessions as list_checkin_sessions

    return ok(list_checkin_sessions(db, student))


@router.post("/checkin")
async def checkin(
    session_id: int = Form(...),
    image: UploadFile = File(...),
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    from ...services.attendance import self_checkin

    content = await image.read()
    return ok(self_checkin(db, student, session_id, content))


@router.post("/appeal")
def appeal(
    req: AppealCreate,
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    from ...services.appeal import create_appeal

    return ok(create_appeal(db, student, req.session_id, req.reason))


@router.get("/appeals")
def my_appeals(
    student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    from ...services.appeal import my_appeals as list_my_appeals

    return ok(list_my_appeals(db, student))


@router.get("")
def list_attendance(
    class_name: str | None = None,
    session_id: int | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    q = (
        db.query(Attendance, Student, Course)
        .join(Student, Attendance.student_id == Student.id)
        .join(Course, Attendance.course_id == Course.id)
    )
    if class_name:
        q = q.filter(Student.class_name == class_name)
    if session_id:
        q = q.filter(Attendance.session_id == session_id)
    rows = q.order_by(Attendance.sign_time.desc()).all()
    data = [
        {
            "id": a.id,
            "student_no": s.student_no,
            "name": s.name,
            "class_name": s.class_name,
            "course_name": c.name,
            "session_id": a.session_id,
            "date": a.session_date.isoformat() if a.session_date else None,
            "sign_time": a.sign_time.strftime("%Y-%m-%d %H:%M:%S") if a.sign_time else None,
            "status": a.status,
            "photo_path": a.photo_path,
        }
        for a, s, c in rows
    ]
    return ok(data)


@router.delete("")
def clear_attendance(
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    from ...services.attendance import clear_attendance as do_clear

    return ok(do_clear(db))