"""结构化审计日志。"""
from __future__ import annotations

from loguru import logger

_audit_logger = logger.bind(channel="audit")


def audit(operator: str, action: str, result: str = "ok", **extra) -> None:
    """记录一条审计日志：{操作人, 类型, 时间, 结果}。"""
    _audit_logger.info(
        "AUDIT | operator={operator} | action={action} | result={result} | {extra}",
        operator=operator,
        action=action,
        result=result,
        extra=extra or {},
    )