"""将 ClassVision 的只读查询能力暴露为本地 MCP 工具。"""
from __future__ import annotations

import asyncio
import importlib.util
import socket
import threading
import time
from typing import Any

from loguru import logger

from ..models import Attendance, ClassSession, Course, Student
from ..models.base import SessionLocal
from ..services.attendance import monitor, my_attendance
from .config import McpSettings
from .mcp_bridge import OfficialMcpBridge


class McpService:
    """只读 MCP 服务：独立 daemon 线程跑 FastMCP SSE，供小智云端 LLM 调用。"""

    def __init__(self, settings: McpSettings) -> None:
        self.settings = settings
        self._mcp: Any | None = None
        self._server_thread: threading.Thread | None = None
        self._server_loop: asyncio.AbstractEventLoop | None = None
        self._uvicorn_server: Any | None = None
        self._bridge: OfficialMcpBridge | None = None
        self._official_bridge_enabled = bool(settings.official_endpoint)
        self._running = False
        self._reason: str | None = None
        self._tool_names = [
            "get_system_status",
            "list_class_sessions",
            "get_session_monitor",
            "list_students",
            "list_courses",
            "get_student_attendance",
        ]

    def start(self) -> None:
        if not self.settings.enabled:
            self._reason = "MCP 未启用"
            logger.info("MCP 未启用")
            return
        try:
            from fastmcp import FastMCP
        except ImportError:
            self._reason = "fastmcp 未安装"
            logger.warning("MCP 不可用：fastmcp 未安装")
            return
        except Exception:
            self._reason = "fastmcp 初始化失败"
            logger.exception("FastMCP 初始化失败")
            return

        self._mcp = FastMCP("ClassVision Assistant")
        self._register_tools()
        self._server_thread = threading.Thread(
            target=self._run_server,
            name="classvision-mcp-server",
            daemon=True,
        )
        self._server_thread.start()
        if not self._wait_for_port(self.settings.host, self.settings.port):
            self._reason = "本地 MCP 服务启动超时"
            logger.error("本地 MCP 服务启动超时")
            return
        self._running = True
        logger.info("MCP 本地服务 {}", self.local_sse_url)

        self._start_official_bridge()

    def set_official_bridge_enabled(self, enabled: bool) -> None:
        if enabled and not self.settings.official_endpoint:
            raise ValueError("未配置在线 MCP 端点")
        if enabled == self._official_bridge_enabled:
            return
        if self._bridge is not None:
            self._bridge.stop()
            self._bridge = None
        self._official_bridge_enabled = enabled
        if enabled and self._running:
            self._start_official_bridge()

    def _start_official_bridge(self) -> None:
        endpoint = self.settings.official_endpoint
        if not self._official_bridge_enabled or not endpoint:
            return
        if importlib.util.find_spec("mcp_proxy") is None:
            self._reason = "mcp_proxy 未安装"
            logger.warning("未安装 mcp-proxy，跳过在线 MCP 桥接")
            return
        self._bridge = OfficialMcpBridge(endpoint, self.local_sse_url)
        self._bridge.start()
        logger.info("MCP 在线桥接已启动")

    def stop(self) -> None:
        if self._bridge is not None:
            self._bridge.stop()
            self._bridge = None

        server = self._uvicorn_server
        loop = self._server_loop
        thread = self._server_thread
        if server is not None:
            server.should_exit = True
        if loop and loop.is_running():
            loop.call_soon_threadsafe(lambda: None)
        if thread and thread.is_alive():
            thread.join(timeout=5.0)
        self._running = False
        self._server_thread = None
        self._server_loop = None
        self._uvicorn_server = None

    @property
    def local_sse_url(self) -> str:
        return f"http://{self.settings.host}:{self.settings.port}/sse"

    def status(self) -> dict[str, Any]:
        bridge = self._bridge
        return {
            "enabled": self.settings.enabled,
            "local_server_running": self._running,
            "local_sse_url": self.local_sse_url if self._running else None,
            "official_endpoint_configured": bool(self.settings.official_endpoint),
            "official_bridge_enabled": self._official_bridge_enabled,
            "official_bridge_connected": bool(bridge and bridge.connected),
            "tools": list(self._tool_names),
            "reason": self._reason,
        }

    def _register_tools(self) -> None:
        mcp = self._mcp
        if mcp is None:
            raise RuntimeError("MCP 未初始化")

        @mcp.tool(
            name="get_system_status",
            description="读取智课眼后端摘要：学生、课程、课堂与考勤记录数量。只读。",
        )
        def get_system_status() -> dict[str, Any]:
            db = SessionLocal()
            try:
                return {
                    "students": db.query(Student).count(),
                    "courses": db.query(Course).count(),
                    "class_sessions": db.query(ClassSession).count(),
                    "attendance_records": db.query(Attendance).count(),
                }
            finally:
                db.close()

        @mcp.tool(
            name="list_class_sessions",
            description="查询最近课堂列表（课程、日期、状态、应到/实到人数、质量分）。只读。",
        )
        def list_class_sessions(limit: int = 20) -> dict[str, Any]:
            limit = max(1, min(int(limit), 200))
            db = SessionLocal()
            try:
                sessions = (
                    db.query(ClassSession)
                    .order_by(ClassSession.id.desc())
                    .limit(limit)
                    .all()
                )
                courses = {c.id: c for c in db.query(Course).all()}
                items = []
                for s in sessions:
                    course = courses.get(s.course_id)
                    items.append(
                        {
                            "id": s.id,
                            "course_name": course.name if course else None,
                            "session_date": s.session_date.isoformat() if s.session_date else None,
                            "expected_count": s.expected_count,
                            "actual_count": s.actual_count,
                            "quality_score": s.quality_score,
                            "status": s.status,
                        }
                    )
                return {"sessions": items}
            finally:
                db.close()

        @mcp.tool(
            name="get_session_monitor",
            description="查询指定课堂的实时监控：应到/实到/缺席名单与质量分。只读。",
        )
        def get_session_monitor(session_id: int) -> dict[str, Any]:
            db = SessionLocal()
            try:
                return monitor(db, session_id)
            finally:
                db.close()

        @mcp.tool(
            name="list_students",
            description="查询指定班级的学生名单（学号、姓名、专业）。只读。",
        )
        def list_students(class_name: str) -> dict[str, Any]:
            db = SessionLocal()
            try:
                students = (
                    db.query(Student).filter(Student.class_name == class_name).all()
                )
                return {
                    "students": [
                        {
                            "student_no": s.student_no,
                            "name": s.name,
                            "class_name": s.class_name,
                            "major": s.major,
                        }
                        for s in students
                    ]
                }
            finally:
                db.close()

        @mcp.tool(
            name="list_courses",
            description="查询全部课程列表（课程名、教师、班级、地点）。只读。",
        )
        def list_courses() -> dict[str, Any]:
            db = SessionLocal()
            try:
                courses = db.query(Course).all()
                return {
                    "courses": [
                        {
                            "id": c.id,
                            "name": c.name,
                            "teacher_name": c.teacher_name,
                            "class_name": c.class_name,
                            "location": c.location,
                        }
                        for c in courses
                    ]
                }
            finally:
                db.close()

        @mcp.tool(
            name="get_student_attendance",
            description="查询指定学号学生的考勤统计与明细（出勤率、按课程汇总、记录）。只读。",
        )
        def get_student_attendance(student_no: str) -> dict[str, Any]:
            db = SessionLocal()
            try:
                student = (
                    db.query(Student).filter(Student.student_no == student_no).first()
                )
                if student is None:
                    return {"available": False, "message": f"未找到学号 {student_no} 的学生"}
                return my_attendance(db, student)
            finally:
                db.close()

    def _run_server(self) -> None:
        loop: asyncio.AbstractEventLoop | None = None
        try:
            import uvicorn

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._server_loop = loop
            mcp = self._mcp
            if mcp is None:
                raise RuntimeError("MCP 未初始化")
            app = mcp.http_app(transport="sse")
            config = uvicorn.Config(
                app,
                host=self.settings.host,
                port=self.settings.port,
                timeout_graceful_shutdown=2,
                lifespan="on",
                log_level="warning",
            )
            self._uvicorn_server = uvicorn.Server(config)
            loop.run_until_complete(self._uvicorn_server.serve())
        except Exception:
            logger.exception("本地 MCP 服务运行异常")
        finally:
            self._uvicorn_server = None
            self._server_loop = None
            self._running = False
            if loop is not None:
                loop.close()

    @staticmethod
    def _wait_for_port(host: str, port: int, timeout: float = 10.0) -> bool:
        deadline = time.monotonic() + timeout
        connect_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
        while time.monotonic() < deadline:
            try:
                with socket.create_connection((connect_host, port), timeout=0.5):
                    return True
            except OSError:
                pass
        return False
