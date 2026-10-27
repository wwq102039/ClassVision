"""考勤服务：签到登记、监控快照、个人汇总。"""
from __future__ import annotations

import datetime as dt

from loguru import logger
from sqlalchemy.orm import Session

from ..ai.embedder import embedder
from ..ai.inference import InferenceService, decode_image, detect_faces
from ..ai.matcher import CosineMatcher
from ..config import settings
from ..core import security
from ..core.audit import audit
from ..models import Appeal, Attendance, ClassSession, Course, Student
from .face import build_gallery

# 内存缓存：最近一次识别的未识别项（供监控快照展示）
_session_unrecognized: dict[int, list[dict]] = {}


def _session_start(session: ClassSession) -> dt.datetime:
    return dt.datetime.combine(
        session.session_date,
        dt.time(settings.CLASS_START_HOUR, settings.CLASS_START_MINUTE),
    )


def _judge_status(session: ClassSession, sign_time: dt.datetime) -> str:
    late_threshold = _session_start(session) + dt.timedelta(minutes=settings.LATE_GRACE_MINUTES)
    return "迟到" if sign_time > late_threshold else "正常"


def _expected_students(db: Session, course: Course) -> list[Student]:
    return db.query(Student).filter(Student.class_name == course.class_name).all()


def _save_face_capture(image, box) -> str | None:
    """裁剪识别到的人脸并加密落盘，返回相对路径（失败返回 None）。"""
    import cv2

    x1, y1, x2, y2 = (int(round(v)) for v in box.xyxy)
    ih, iw = image.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(iw, x2), min(ih, y2)
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None
    crop = image[y1:y2, x1:x2]
    ok, jpg = cv2.imencode(".jpg", crop)
    if not ok:
        return None
    return security.encrypt_file(jpg.tobytes(), "captures", ".jpg")


def _compute_quality(db: Session, session: ClassSession, expected: int) -> float:
    """课堂质量分：出勤率 70% + 准时率 30%，归一化到 [0, 1]。"""
    records = (
        db.query(Attendance)
        .filter(Attendance.session_id == session.id)
        .all()
    )
    actual = len(records)
    if expected <= 0:
        return 0.0
    late = sum(1 for r in records if r.status == "迟到")
    attendance_rate = actual / expected
    on_time_rate = (actual - late) / actual if actual > 0 else 0.0
    return round(min(1.0, attendance_rate * 0.7 + on_time_rate * 0.3), 4)


def recognize_and_checkin(db: Session, session_id: int, image_bytes: bytes) -> dict:
    """识别 + 签到闭环：检测 → 特征 → 比对 → 应到校验 → 去重 → 迟到判定 → 落库。"""
    session = db.get(ClassSession, session_id)
    if session is None:
        from ..core.exceptions import SessionNotFoundError

        raise SessionNotFoundError()
    course = db.get(Course, session.course_id)
    image = decode_image(image_bytes)

    # 底库仅限本课程班级已注册学生
    gallery = build_gallery(db, class_name=course.class_name)
    result = InferenceService().recognize(image, gallery)

    expected_ids = {s.id for s in _expected_students(db, course)}
    sign_time = dt.datetime.now()
    recognized_out = []
    unrecognized_out = []
    newly_checked = 0

    for face in result["faces"]:
        if face.student is not None and face.student.id in expected_ids:
            student = face.student
            existing = (
                db.query(Attendance)
                .filter(Attendance.student_id == student.id, Attendance.session_id == session.id)
                .first()
            )
            if existing is None:
                status = _judge_status(session, sign_time)
                photo = _save_face_capture(image, face.box)
                rec = Attendance(
                    student_id=student.id,
                    course_id=course.id,
                    session_id=session.id,
                    session_date=session.session_date,
                    sign_time=sign_time,
                    method="无感识别",
                    status=status,
                    photo_path=photo,
                )
                db.add(rec)
                db.flush()
                newly_checked += 1
                audit(student.student_no, "签到", "ok", session_id=session.id, status=status)
            else:
                status = existing.status
                photo = existing.photo_path
            recognized_out.append(
                {
                    "student_no": student.student_no,
                    "name": student.name,
                    "status": status,
                    "photo_path": photo,
                    "box": [round(v) for v in face.box.xyxy],
                }
            )
        else:
            unrecognized_out.append(
                {"box": [round(v) for v in face.box.xyxy], "reason": "low_similarity"}
            )

    # 更新实到人数
    actual = (
        db.query(Attendance)
        .filter(Attendance.session_id == session.id)
        .count()
    )
    session.actual_count = actual
    _session_unrecognized[session.id] = [
        {"box": u["box"], "frame_time": sign_time.strftime("%H:%M:%S")} for u in unrecognized_out
    ]
    db.commit()

    return {
        "detected_count": result["detected_count"],
        "recognized": recognized_out,
        "unrecognized": unrecognized_out,
    }


def checkin_sessions(db: Session, student: Student) -> list[dict]:
    """返回学生本班全部课堂及是否已签到标记，供自助签到选择。"""
    sessions = (
        db.query(ClassSession)
        .join(Course, ClassSession.course_id == Course.id)
        .filter(Course.class_name == student.class_name)
        .order_by(ClassSession.session_date.desc(), ClassSession.id.desc())
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
        course = db.get(Course, s.course_id)
        result.append(
            {
                "session_id": s.id,
                "course_name": course.name if course else None,
                "session_date": s.session_date.isoformat() if s.session_date else None,
                "status": s.status,
                "checked": s.id in checked,
            }
        )
    return result


def self_checkin(db: Session, student: Student, session_id: int, image_bytes: bytes) -> dict:
    """学生自助签到：检测人脸 → 比对本班底库 → 校验身份与登录一致 → 落库。"""
    from ..core.exceptions import (
        AlreadyCheckedInError,
        NotInAttendanceListError,
        SelfCheckinIdentityError,
        SessionNotFoundError,
    )

    session = db.get(ClassSession, session_id)
    if session is None:
        raise SessionNotFoundError()
    course = db.get(Course, session.course_id)
    if course is None or course.class_name != student.class_name:
        raise NotInAttendanceListError()

    existing = (
        db.query(Attendance)
        .filter(Attendance.student_id == student.id, Attendance.session_id == session.id)
        .first()
    )
    if existing is not None:
        raise AlreadyCheckedInError()

    image = decode_image(image_bytes)
    boxes = detect_faces(image)
    if not boxes:
        raise SelfCheckinIdentityError("未检测到人脸，请正对镜头后重试")

    box = max(boxes, key=lambda b: b.score)

    gallery = build_gallery(db, class_name=course.class_name)
    if not gallery:
        raise SelfCheckinIdentityError("本班尚未录入人脸底库，请联系教师先导入人脸")
    if not any(g.id == student.id for g in gallery):
        raise SelfCheckinIdentityError("你本人尚未录入人脸照片，请联系教师导入")

    embeds = embedder().embed(image, [box])
    emb = embeds[0] if embeds and embeds[0].size else None
    if emb is None:
        raise SelfCheckinIdentityError("人脸特征提取失败，请重试")

    idx = CosineMatcher().match(emb, gallery)
    if idx is None:
        raise SelfCheckinIdentityError("人脸比对失败，请使用清晰正脸照片重试")
    if gallery[idx].id != student.id:
        raise SelfCheckinIdentityError("识别身份与登录账号不一致，请使用本人照片")

    sign_time = dt.datetime.now()
    status = _judge_status(session, sign_time)
    photo = _save_face_capture(image, box)
    rec = Attendance(
        student_id=student.id,
        course_id=course.id,
        session_id=session.id,
        session_date=session.session_date,
        sign_time=sign_time,
        method="自助签到",
        status=status,
        photo_path=photo,
    )
    db.add(rec)
    db.flush()

    actual = (
        db.query(Attendance)
        .filter(Attendance.session_id == session.id)
        .count()
    )
    session.actual_count = actual
    expected = len(_expected_students(db, course))
    session.expected_count = expected
    session.quality_score = _compute_quality(db, session, expected)
    if session.status == "scheduled":
        session.status = "live"
    db.commit()

    audit(student.student_no, "自助签到", "ok", session_id=session.id, status=status)

    return {
        "session_id": session.id,
        "course_name": course.name,
        "status": status,
        "sign_time": sign_time.strftime("%Y-%m-%d %H:%M:%S"),
        "photo_path": photo,
    }


def monitor(db: Session, session_id: int) -> dict:
    session = db.get(ClassSession, session_id)
    if session is None:
        from ..core.exceptions import SessionNotFoundError

        raise SessionNotFoundError()
    course = db.get(Course, session.course_id)
    expected_students = _expected_students(db, course)
    checked = (
        db.query(Attendance)
        .filter(Attendance.session_id == session.id)
        .all()
    )
    checked_ids = {a.student_id for a in checked}
    absent_names = [s.name for s in expected_students if s.id not in checked_ids]
    expected = len(expected_students)
    actual = len(checked_ids)
    absent = max(0, expected - actual)
    session.expected_count = expected
    session.actual_count = actual
    session.absent_names = absent_names
    session.quality_score = _compute_quality(db, session, expected)
    if session.status == "scheduled":
        session.status = "live"
    db.commit()

    return {
        "expected": expected,
        "actual": actual,
        "absent": absent,
        "absent_names": absent_names,
        "quality_score": session.quality_score,
        "unrecognized": _session_unrecognized.get(session.id, []),
        "stream_status": session.status,
    }


def my_attendance(db: Session, student: Student, course_id: int | None = None) -> dict:
    from .appeal import absent_sessions

    query = db.query(Attendance).filter(Attendance.student_id == student.id)
    if course_id:
        query = query.filter(Attendance.course_id == course_id)
    records = query.order_by(Attendance.sign_time.desc()).all()

    absent = absent_sessions(db, student)

    summary = {"正常": 0, "迟到": 0, "缺勤": len(absent)}
    by_course: dict[str, dict] = {}
    rec_list = []
    for a in records:
        status = a.status if a.status in ("正常", "迟到", "缺勤") else "正常"
        summary[status] += 1
        course = db.get(Course, a.course_id)
        cname = course.name if course else "未知课程"
        c = by_course.setdefault(cname, {"course_name": cname, "正常": 0, "迟到": 0, "缺勤": 0})
        c[status] += 1
        rec_list.append(
            {
                "id": a.id,
                "course_name": cname,
                "date": a.session_date.isoformat() if a.session_date else None,
                "sign_time": a.sign_time.strftime("%Y-%m-%d %H:%M:%S") if a.sign_time else None,
                "status": a.status,
                "photo_path": a.photo_path,
            }
        )

    # 缺勤按课程聚合（缺勤无签到记录，需从 absent_sessions 补）
    for s in absent:
        cname = s["course_name"] or "未知课程"
        c = by_course.setdefault(cname, {"course_name": cname, "正常": 0, "迟到": 0, "缺勤": 0})
        c["缺勤"] += 1

    by_course_list = []
    for c in by_course.values():
        total = c["正常"] + c["迟到"] + c["缺勤"]
        c["total"] = total
        c["rate"] = round((c["正常"] + c["迟到"]) / total, 4) if total else None
        by_course_list.append(c)
    by_course_list.sort(key=lambda c: c["total"], reverse=True)

    total_sessions = summary["正常"] + summary["迟到"] + summary["缺勤"]
    checked = summary["正常"] + summary["迟到"]
    attendance_rate = round(checked / total_sessions, 4) if total_sessions else None

    return {
        "student": {
            "name": student.name,
            "student_no": student.student_no,
            "class_name": student.class_name,
            "major": student.major,
            "photo_path": student.photo_path,
        },
        "summary": summary,
        "attendance_rate": attendance_rate,
        "total_sessions": total_sessions,
        "checked_sessions": checked,
        "by_course": by_course_list,
        "records": rec_list,
        "absent_sessions": absent,
    }


def clear_attendance(db: Session) -> dict:
    """演示用：清空全部考勤记录与申诉，并重置课堂统计到未开课状态。"""
    attendance_count = db.query(Attendance).count()
    appeal_count = db.query(Appeal).count()

    db.query(Attendance).delete()
    db.query(Appeal).delete()
    _session_unrecognized.clear()

    for s in db.query(ClassSession).all():
        s.actual_count = 0
        s.absent_names = None
        s.quality_score = None
        s.status = "scheduled"

    db.commit()
    audit("teacher", "清空考勤记录", "ok", attendance=attendance_count, appeals=appeal_count)
    return {"cleared_attendance": attendance_count, "cleared_appeals": appeal_count}