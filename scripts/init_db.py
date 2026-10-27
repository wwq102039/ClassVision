"""建表与种子数据脚本。

用法：
    python scripts/init_db.py
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

# 将 backend 目录加入模块搜索路径
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models import Base, ClassSession, Course, Student  # noqa: E402
from app.models.base import engine, SessionLocal  # noqa: E402


def init() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 课程
        course = db.query(Course).filter(Course.name == "数据结构").first()
        if course is None:
            course = Course(
                name="数据结构",
                teacher_name="张老师",
                schedule_time="周一 08:00-09:40",
                location="教学楼A-301",
                class_name="计科2301",
            )
            db.add(course)
            db.flush()

        # 学生（计科2301 班，暂无人脸特征，需在管理端"人脸库管理"导入照片）
        demo_students = [
            ("20230101", "王小明", "计科2301", "计算机科学与技术"),
            ("20230102", "李小红", "计科2301", "计算机科学与技术"),
            ("20230103", "张伟", "计科2301", "计算机科学与技术"),
            ("20230104", "刘芳", "计科2301", "计算机科学与技术"),
            ("20230105", "陈强", "计科2301", "计算机科学与技术"),
        ]
        for no, name, cls, major in demo_students:
            if db.query(Student).filter(Student.student_no == no).first() is None:
                db.add(Student(student_no=no, name=name, class_name=cls, major=major))

        # 示例课堂记录（今天）
        session = (
            db.query(ClassSession)
            .filter(ClassSession.course_id == course.id)
            .order_by(ClassSession.id.desc())
            .first()
        )
        if session is None:
            db.add(
                ClassSession(
                    course_id=course.id,
                    session_date=dt.date.today(),
                    expected_count=len(demo_students),
                    status="scheduled",
                )
            )

        db.commit()
        print("数据库初始化完成：classvision.db")
        print("默认教师账号：admin / admin123")
        print("默认学生密码：123456（学生用学号登录，如 20230101）")
    finally:
        db.close()


if __name__ == "__main__":
    init()