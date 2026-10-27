"""Pydantic 请求/响应契约。"""
from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


# ---------- 认证 ----------
class LoginRequest(BaseModel):
    username: str
    password: str
    role: str = Field(default="teacher", pattern="^(student|teacher)$")


class LoginData(BaseModel):
    token: str
    role: str
    name: str
    student_no: str | None = None


# ---------- 学生 ----------
class StudentCreate(BaseModel):
    student_no: str
    name: str
    class_name: str
    major: str | None = None


class StudentUpdate(BaseModel):
    name: str | None = None
    class_name: str | None = None
    major: str | None = None


class StudentOut(BaseModel):
    id: int
    student_no: str
    name: str
    class_name: str
    major: str | None = None
    has_embedding: bool = False
    register_time: dt.datetime | None = None

    class Config:
        from_attributes = True


# ---------- 课程 / 课堂 ----------
class CourseCreate(BaseModel):
    name: str
    teacher_name: str | None = None
    schedule_time: str | None = None
    location: str | None = None
    class_name: str


class SessionCreate(BaseModel):
    course_id: int
    session_date: dt.date | None = None


# ---------- 申诉 ----------
class AppealCreate(BaseModel):
    session_id: int
    reason: str | None = None


class AppealReview(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    comment: str | None = None