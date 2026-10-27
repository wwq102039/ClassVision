"""FastAPI 应用入口。"""
from __future__ import annotations

try:
    from pathlib import Path

    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from .config import settings
from .core.exceptions import BizError
from .core.response import fail
from .api.routes import (
    appeals,
    attendance,
    auth,
    courses,
    faces,
    recognition,
    reports,
    sessions,
    students,
)
from .assistant.config import McpSettings
from .assistant.mcp_service import McpService
from .assistant.routes import router as assistant_router
from .assistant.xiaozhi import XiaozhiBridge, XiaozhiSettings


def warmup_models() -> None:
    """预热检测与特征模型，避免首个识别/追踪请求因模型加载超过前端超时。"""
    try:
        from .ai.detector import detector as _detector
        from .ai.embedder import embedder as _embedder

        _detector()
        _embedder()
        logger.info("模型预热完成")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"模型预热失败（首次请求仍会懒加载）: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    warmup_models()
    app.state.mcp_service.start()
    yield
    app.state.mcp_service.stop()


app = FastAPI(
    title="智课眼 - 无感课堂考勤与学情分析系统",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(BizError)
async def biz_error_handler(request: Request, exc: BizError):
    return JSONResponse(status_code=exc.http_status, content=fail(exc))


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception(f"未捕获异常: {exc}")
    return JSONResponse(status_code=500, content={"code": 500, "message": "服务器内部错误", "data": None})


# 静态文件：加密存储图片的解密只读路由（提供抓拍照人脸缩略图给报表/申诉查看）
@app.get("/static/{subdir}/{filename}")
async def serve_encrypted_file(subdir: str, filename: str):
    from fastapi.responses import Response

    from .core import security

    raw = security.read_encrypted_file(f"{subdir}/{filename}")
    if raw is None:
        return JSONResponse(status_code=404, content={"code": 1001, "message": "文件不存在", "data": None})
    return Response(content=raw, media_type="image/jpeg")


# 语音助手：小智桥接 + 本地 MCP 只读工具（按环境变量静态配置）
app.state.xiaozhi = XiaozhiBridge(XiaozhiSettings.from_environment())
app.state.mcp_service = McpService(McpSettings.from_environment())

# 路由挂载
API_PREFIX = "/api/v1"
for r in (auth, students, courses, faces, sessions, recognition, attendance, appeals, reports):
    app.include_router(r.router, prefix=API_PREFIX)
app.include_router(assistant_router, prefix=API_PREFIX)


@app.get("/")
def root():
    return {"code": 0, "message": "智课眼后端服务运行中", "data": {"docs": "/docs"}}


def init_db_if_needed() -> None:
    """启动时若无数据库则自动建表（便于零配置）。"""
    from .models import Base
    from .models.base import engine

    Base.metadata.create_all(bind=engine)