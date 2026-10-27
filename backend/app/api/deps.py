"""FastAPI 依赖注入：鉴权与角色区分。"""
from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from ..core import security
from ..core.exceptions import AuthFailedError, NoPermissionError
from ..models.base import get_db
from ..models import Student


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthFailedError("缺少认证令牌")
    token = authorization[len("Bearer "):]
    return security.decode_token(token)


def require_teacher(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "teacher":
        raise NoPermissionError("仅教师/管理员可操作")
    return user


def require_student(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "student":
        raise NoPermissionError("仅学生可操作")
    return user


def get_current_student(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Student:
    if user.get("role") != "student" or not user.get("student_no"):
        raise NoPermissionError("仅学生可操作")
    student = db.query(Student).filter(Student.student_no == user["student_no"]).first()
    if student is None:
        raise AuthFailedError("学生账号不存在")
    return student