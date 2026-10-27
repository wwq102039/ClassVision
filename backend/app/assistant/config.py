"""助手相关配置（MCP 本地服务 + 官方桥接）。"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _parse_bool(value: str | None) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"} if value else False


def _parse_int(value: str | None, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


@dataclass(frozen=True, slots=True)
class McpSettings:
    enabled: bool = False
    host: str = "127.0.0.1"
    port: int = 8765
    official_endpoint: str | None = None

    @classmethod
    def from_environment(cls) -> McpSettings:
        configured_host = os.environ.get("CV_MCP_HOST", "127.0.0.1").strip()
        host = configured_host if configured_host in {"127.0.0.1", "::1"} else "127.0.0.1"
        configured_endpoint = os.environ.get("CV_MCP_OFFICIAL_ENDPOINT", "").strip()
        official_endpoint = (
            configured_endpoint if configured_endpoint.startswith(("ws://", "wss://")) else None
        )
        explicit_enabled = os.environ.get("CV_MCP_ENABLED")
        enabled = (
            _parse_bool(explicit_enabled)
            if explicit_enabled is not None
            else bool(official_endpoint)
        )
        return cls(
            enabled=enabled,
            host=host,
            port=max(1024, min(_parse_int(os.environ.get("CV_MCP_PORT"), 8765), 65_535)),
            official_endpoint=official_endpoint,
        )
