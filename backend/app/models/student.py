"""学生模型。"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_no: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    class_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    major: Mapped[str | None] = mapped_column(String(64), nullable=True)
    face_embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    register_time: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.now)