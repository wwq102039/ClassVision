"""学生管理路由（教师权限）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...api.deps import require_teacher
from ...core.exceptions import StudentNotFoundError
from ...core.response import ok
from ...models import Appeal, Attendance, Student
from ...models.base import get_db
from ...schemas.schemas import StudentCreate, StudentOut, StudentUpdate

router = APIRouter(prefix="/students", tags=["学生"])


def _to_out(s: Student) -> dict:
    return {
        "id": s.id,
        "student_no": s.student_no,
        "name": s.name,
        "class_name": s.class_name,
        "major": s.major,
        "has_embedding": s.face_embedding is not None,
        "register_time": s.register_time.strftime("%Y-%m-%d %H:%M:%S") if s.register_time else None,
    }


@router.get("")
def list_students(
    class_name: str | None = None,
    major: str | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_teacher),
):
    q = db.query(Student)
    if class_name:
        q = q.filter(Student.class_name == class_name)
    if major:
        q = q.filter(Student.major == major)
    items = q.order_by(Student.student_no).all()
    return ok([_to_out(s) for s in items])


@router.get("/{student_id}")
def get_student(student_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    s = db.get(Student, student_id)
    if s is None:
        raise StudentNotFoundError()
    return ok(_to_out(s))


@router.post("")
def create_student(req: StudentCreate, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    s = Student(
        student_no=req.student_no,
        name=req.name,
        class_name=req.class_name,
        major=req.major,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return ok(_to_out(s))


@router.put("/{student_id}")
def update_student(
    student_id: int, req: StudentUpdate, db: Session = Depends(get_db), _: dict = Depends(require_teacher)
):
    s = db.get(Student, student_id)
    if s is None:
        raise StudentNotFoundError()
    if req.name is not None:
        s.name = req.name
    if req.class_name is not None:
        s.class_name = req.class_name
    if req.major is not None:
        s.major = req.major
    db.commit()
    db.refresh(s)
    return ok(_to_out(s))


@router.delete("/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db), _: dict = Depends(require_teacher)):
    s = db.get(Student, student_id)
    if s is None:
        raise StudentNotFoundError()
    db.query(Attendance).filter(Attendance.student_id == student_id).delete()
    db.query(Appeal).filter(Appeal.student_id == student_id).delete()
    db.delete(s)
    db.commit()
    return ok({"deleted": student_id})