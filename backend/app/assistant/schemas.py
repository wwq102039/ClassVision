"""助手相关 Pydantic 响应模型。"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class McpStatusSnapshot(BaseModel):
    enabled: bool
    local_server_running: bool
    local_sse_url: str | None
    official_endpoint_configured: bool
    official_bridge_enabled: bool
    official_bridge_connected: bool
    tools: list[str]
    reason: str | None


class AssistantStatusSnapshot(BaseModel):
    enabled: bool
    mode: Literal["official", "local"]
    local_available: bool
    configured: bool
    pairing_required: bool
    codec_available: bool
    device_id: str | None
    client_id: str | None
    endpoint_host: str | None
    input_sample_rate: int
    output_sample_rate: int
    frame_duration_ms: int
    mcp: McpStatusSnapshot | None = None
