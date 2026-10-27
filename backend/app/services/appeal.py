"""申诉服务：缺勤申诉的创建、列表与审核。"""
from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session

from ..core.audit import audit
from ..core.exceptions import (
    AppealExistsError,
    AppealNotFoundError,
    NotAbsentError,
    NotInAttendanceListError,
    SessionNotFoundError,
)
from ..models import Appeal, Attendance, ClassSession, Course, Student


def absent_sessions(db: Session, student: Student) -> list[dict]:
    """返回学生应到但缺勤的课堂（无考勤记录）。"""
    sessions = (
        db.query(ClassSession)
        .join(Course, ClassSession.course_id == Course.id)
        .filter(Course.class_name == student.class_name)
        # 只把「已经上过」的课算作缺勤，未开始/今天的课不判缺勤
        .filter(ClassSession.session_date < dt.date.today())
        .order_by(ClassSession.session_date.desc())
        .all()
    )
    checked = {
        a[0]
        for a in db.query(Attendance.session_id)
        .filter(Attendance.student_id == student.id)
        .all()
    }
    result: list[dict] = []
    for s in sessions:
        if s.id in checked:
            continue
        course = db.get(Course, s.course_id)
        result.append(
            {
                "session_id": s.id,
                "course_name": course.name if course else None,
                "session_date": s.session_date.isoformat() if s.session_date else None,
            }
        )
    return result


def create_appeal(db: Session, student: Student, session_id: int, reason: str | None) -> Appeal:
    session = db.get(ClassSession, session_id)
    if session is None:
        raise SessionNotFoundError()
    course = db.get(Course, session.course_id)
    if course is None or course.class_name != student.class_name:
        raise NotInAttendanceListError()

    existing_att = (
        db.query(Attendance)
        .filter(Attendance.student_id == student.id, Attendance.session_id == session_id)
        .first()
    )
    if existing_att is not None:
        raise NotAbsentError()

    dup = (
        db.query(Appeal)
        .filter(Appeal.student_id == student.id, Appeal.session_id == session_id)
        .first()
    )
    if dup is not None:
        raise AppealExistsError()

    appeal = Appeal(
        student_id=student.id,
        session_id=session_id,
        course_id=course.id,
        reason=reason or "",
        status="pending",
    )
    db.add(appeal)
    db.commit()
    db.refresh(appeal)
    audit(student.student_no, "发起申诉", "ok", session_id=session_id)
    return {
        "id": appeal.id,
        "session_id": appeal.session_id,
        "status": appeal.status,
        "created_at": appeal.created_at.strftime("%Y-%m-%d %H:%M:%S"),
    }


def my_appeals(db: Session, student: Student) -> list[dict]:
    """返回学生本人的申诉记录及审核状态，供学生端查看进度。"""
    rows = (
        db.query(Appeal, Course, ClassSession)
        .join(Course, Appeal.course_id == Course.id)
        .join(ClassSession, Appeal.session_id == ClassSession.id)
        .filter(Appeal.student_id == student.id)
        .order_by(Appeal.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "course_name": c.name,
            "session_date": ss.session_date.isoformat() if ss.session_date else None,
            "reason": a.reason,
            "status": a.status,
            "comment": a.comment,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S") if a.created_at else None,
            "reviewed_at": a.reviewed_at.strftime("%Y-%m-%d %H:%M:%S") if a.reviewed_at else None,
        }
        for a, c, ss in rows
    ]


def list_appeals(db: Session, status: str | None = None) -> list[dict]:
    q = (
        db.query(Appeal, Student, Course, ClassSession)
        .join(Student, Appeal.student_id == Student.id)
        .join(Course, Appeal.course_id == Course.id)
        .join(ClassSession, Appeal.session_id == ClassSession.id)
    )
    if status:
        q = q.filter(Appeal.status == status)
    rows = q.order_by(Appeal.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "student_no": st.student_no,
            "name": st.name,
            "class_name": st.class_name,
            "course_name": c.name,
            "session_id": a.session_id,
            "session_date": ss.session_date.isoformat() if ss.session_date else None,
            "reason": a.reason,
            "status": a.status,
            "comment": a.comment,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M:%S") if a.created_at else None,
        }
        for a, st, c, ss in rows
    ]


def review_appeal(db: Session, appeal_id: int, decision: str, comment: str | None) -> Appeal:
    appeal = db.get(Appeal, appeal_id)
    if appeal is None:
        raise AppealNotFoundError()
    if appeal.status != "pending":
        from ..core.exceptions import BizError

        raise BizError("该申诉已处理，请勿重复操作")

    approved = decision == "approve"
    appeal.status = "approved" if approved else "rejected"
    appeal.comment = comment
    appeal.reviewed_at = dt.datetime.now()

    if approved:
        session = db.get(ClassSession, appeal.session_id)
        existing = (
            db.query(Attendance)
            .filter(
                Attendance.student_id == appeal.student_id,
                Attendance.session_id == appeal.session_id,
            )
            .first()
        )
        if existing is None and session is not None:
            rec = Attendance(
                student_id=appeal.student_id,
                course_id=appeal.course_id,
                session_id=appeal.session_id,
                session_date=session.session_date,
                sign_time=dt.datetime.now(),
                method="申诉",
                status="正常",
            )
            db.add(rec)

    db.commit()
    db.refresh(appeal)
    audit("teacher", f"审核申诉#{appeal.id}", decision, comment=comment)
    return appeal
