"""认证路由：登录。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core import security
from ...core.exceptions import AuthFailedError
from ...core.response import ok
from ...models import Student
from ...models.base import get_db
from ...schemas.schemas import LoginRequest

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if req.role == "teacher":
        if req.username == security.settings.ADMIN_USERNAME and req.password == security.settings.ADMIN_PASSWORD:
            token = security.create_token(
                req.username, "teacher", security.settings.ADMIN_NAME
            )
            return ok(
                {
                    "token": token,
                    "role": "teacher",
                    "name": security.settings.ADMIN_NAME,
                    "student_no": None,
                }
            )
        raise AuthFailedError()
    else:
        student = db.query(Student).filter(Student.student_no == req.username).first()
        if student is None or req.password != security.settings.STUDENT_DEFAULT_PASSWORD:
            raise AuthFailedError()
        token = security.create_token(
            student.student_no, "student", student.name, student.student_no
        )
        return ok(
            {
                "token": token,
                "role": "student",
                "name": student.name,
                "student_no": student.student_no,
            }
        )