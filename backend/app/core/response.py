"""统一响应包裹。"""
from __future__ import annotations

from typing import Any

from .exceptions import BizError


def ok(data: Any = None, message: str = "ok") -> dict:
    return {"code": 0, "message": message, "data": data}


def fail(err: BizError) -> dict:
    return {"code": err.code, "message": err.message, "data": None}