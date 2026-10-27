"""考勤记录模型。"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("student_id", "session_id", name="uq_attendance_student_session"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False)
    session_id: Mapped[int] = mapped_column(ForeignKey("class_sessions.id"), nullable=False, index=True)
    session_date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    sign_time: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.now)
    method: Mapped[str] = mapped_column(String(16), default="无感识别")
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="正常")