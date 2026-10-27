"""申诉模型：学生针对某次课堂缺勤发起申诉，教师审核。"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Appeal(Base):
    __tablename__ = "appeals"
    __table_args__ = (
        UniqueConstraint("student_id", "session_id", name="uq_appeal_student_session"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("class_sessions.id"), nullable=False, index=True
    )
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    comment: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.now)
    reviewed_at: Mapped[dt.datetime | None] = mapped_column(DateTime, nullable=True)
