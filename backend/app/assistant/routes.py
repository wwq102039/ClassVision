"""AI 语音助手相关路由：状态查询 + 音频中继 WebSocket + MCP 状态。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request, WebSocket

from ..api.deps import get_current_user
from ..core import security
from ..core.exceptions import AuthFailedError
from .schemas import AssistantStatusSnapshot, McpStatusSnapshot

router = APIRouter()


@router.get("/assistant/status", response_model=AssistantStatusSnapshot)
def get_assistant_status(
    request: Request,
    _: dict = Depends(get_current_user),
) -> AssistantStatusSnapshot:
    status_snapshot = request.app.state.xiaozhi.status()
    status_snapshot["mcp"] = request.app.state.mcp_service.status()
    return AssistantStatusSnapshot(**status_snapshot)


@router.websocket("/assistant/stream")
async def stream_assistant(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="缺少认证令牌")
        return
    try:
        user = security.decode_token(token)
    except AuthFailedError:
        await websocket.close(code=4401, reason="认证令牌无效")
        return
    if user.get("role") not in {"teacher", "student"}:
        await websocket.close(code=4403, reason="无权限")
        return
    await websocket.app.state.xiaozhi.stream(websocket)


@router.get("/mcp/status", response_model=McpStatusSnapshot)
def get_mcp_status(request: Request) -> McpStatusSnapshot:
    return McpStatusSnapshot(**request.app.state.mcp_service.status())
