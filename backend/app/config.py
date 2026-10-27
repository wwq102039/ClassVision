"""全局配置。

所有路径/阈值/密钥从环境变量读取并可回退默认值，满足零配置运行与迁移需求。
"""
from __future__ import annotations

import base64
import os
from pathlib import Path

# 项目根目录：backend/ 的上一级
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


def _env_float(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, default))
    except (TypeError, ValueError):
        return default


class Settings:
    # 数据库与存储
    DB_URL: str = _env("CV_DB_URL", f"sqlite:///{BASE_DIR / 'classvision.db'}")
    MODEL_DIR: Path = Path(_env("CV_MODEL_DIR", str(PROJECT_ROOT / "model")))
    STORAGE_DIR: Path = Path(_env("CV_STORAGE_DIR", str(BASE_DIR / "storage")))
    FACES_DIR: Path = STORAGE_DIR / "faces"
    CAPTURES_DIR: Path = STORAGE_DIR / "captures"

    # AI 后端选择
    DETECTOR_BACKEND: str = _env("CV_DETECTOR_BACKEND", "auto")  # auto|onnx|pt
    EMBEDDER_BACKEND: str = _env("CV_EMBEDDER_BACKEND", "auto")  # auto|insightface|face_recognition|fallback
    DETECTOR_MODEL_ONNX: str = _env("CV_DETECTOR_MODEL_ONNX", "yolov8n_face.onnx")
    DETECTOR_MODEL_PT: str = _env("CV_DETECTOR_MODEL_PT", "yolov8n_face.pt")
    DETECT_CONF: float = _env_float("CV_DETECT_CONF", 0.25)
    DETECT_IOU: float = _env_float("CV_DETECT_IOU", 0.45)
    DETECT_IMG_SIZE: int = _env_int("CV_DETECT_IMG_SIZE", 640)

    # 人脸比对阈值
    MATCH_THRESHOLD: float = _env_float("CV_MATCH_THRESHOLD", 0.5)

    # 签到规则
    LATE_GRACE_MINUTES: int = _env_int("CV_LATE_GRACE_MINUTES", 10)
    CLASS_START_HOUR: int = _env_int("CV_CLASS_START_HOUR", 8)
    CLASS_START_MINUTE: int = _env_int("CV_CLASS_START_MINUTE", 0)

    # 安全
    TOKEN_SECRET: str = _env("CV_TOKEN_SECRET", "classvision-dev-secret-change-me")
    TOKEN_EXPIRE_MINUTES: int = _env_int("CV_TOKEN_EXPIRE_MINUTES", 24 * 60)

    # MVP 简易账号（无独立 users 表）
    ADMIN_USERNAME: str = _env("CV_ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = _env("CV_ADMIN_PASSWORD", "admin123")
    ADMIN_NAME: str = _env("CV_ADMIN_NAME", "管理员")
    STUDENT_DEFAULT_PASSWORD: str = _env("CV_STUDENT_DEFAULT_PASSWORD", "123456")

    # 静态文件对外前缀
    STATIC_URL: str = "/static"

    @property
    def enc_key(self) -> bytes:
        """返回 Fernet 加密密钥（32 字节 urlsafe base64）。

        优先读环境变量 CV_ENC_KEY；否则从本地 secret.key 读取或生成，
        保证同一环境多次启动可解密已落盘数据。
        """
        from cryptography.fernet import Fernet

        env_key = os.environ.get("CV_ENC_KEY")
        if env_key:
            return env_key.encode()

        key_file = BASE_DIR / "secret.key"
        if key_file.exists():
            return key_file.read_bytes().strip()

        key = Fernet.generate_key()
        key_file.write_bytes(key)
        return key

    @property
    def enc_suite(self):
        """惰性创建 Fernet 加解密套件。"""
        from cryptography.fernet import Fernet

        return Fernet(self.enc_key)

    def ensure_dirs(self) -> None:
        for p in (self.STORAGE_DIR, self.FACES_DIR, self.CAPTURES_DIR):
            p.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()