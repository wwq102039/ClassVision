"""横切能力：加密存储 + JWT 鉴权。"""
from __future__ import annotations

import datetime as dt
from typing import Any

import jwt
from loguru import logger

from ..config import settings


# ---------- 加密 ----------

def encrypt_bytes(data: bytes) -> bytes:
    """使用 Fernet 加密字节流，返回密文（含 token 前缀）。"""
    return settings.enc_suite.encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    """解密 Fernet 密文，返回明文字节流。"""
    return settings.enc_suite.decrypt(token)


def encrypt_embedding(vector: Any) -> bytes:
    """将特征向量（numpy 数组）序列化并加密，返回密文。"""
    import numpy as np

    arr = np.asarray(vector, dtype=np.float32)
    return encrypt_bytes(arr.tobytes())


def decrypt_embedding(blob: bytes) -> Any:
    """解密特征向量并还原为 numpy 数组。失败返回 None。"""
    import numpy as np

    try:
        raw = decrypt_bytes(blob)
        return np.frombuffer(raw, dtype=np.float32)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"特征向量解密失败: {exc}")
        return None


def encrypt_file(data: bytes, subdir: str, ext: str = ".jpg") -> str:
    """加密图像字节并写入 storage 子目录，返回相对路径引用。"""
    import uuid

    token = encrypt_bytes(data)
    name = f"{uuid.uuid4().hex}{ext}"
    target_dir = settings.STORAGE_DIR / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / name
    path.write_bytes(token)
    return f"{subdir}/{name}"


def read_encrypted_file(rel_path: str) -> bytes | None:
    """读取加密图像并解密为明文字节。"""
    from pathlib import Path

    full = settings.STORAGE_DIR / rel_path
    if not full.exists():
        return None
    try:
        return decrypt_bytes(full.read_bytes())
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"图像解密失败 {rel_path}: {exc}")
        return None


# ---------- JWT ----------

def create_token(identity: str, role: str, name: str, student_no: str | None = None) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": identity,
        "role": role,
        "name": name,
        "student_no": student_no,
        "iat": now,
        "exp": now + dt.timedelta(minutes=settings.TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.TOKEN_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    """解析 JWT，失败抛出 AuthFailedError。"""
    from .exceptions import AuthFailedError

    try:
        return jwt.decode(token, settings.TOKEN_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AuthFailedError("登录已过期") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthFailedError("无效的令牌") from exc