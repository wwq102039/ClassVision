from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from dataclasses import dataclass, replace
from typing import Any
from urllib import request as urllib_request
from urllib.error import HTTPError
from urllib.parse import urlsplit

import websockets
from fastapi import WebSocket

logger = logging.getLogger(__name__)

_INPUT_SAMPLE_RATE = 16_000
_OUTPUT_SAMPLE_RATE = 24_000
_CHANNELS = 1
_FRAME_DURATION_MS = 20
_INPUT_FRAME_SAMPLES = _INPUT_SAMPLE_RATE * _FRAME_DURATION_MS // 1_000
_MAX_AUDIO_BUFFER_BYTES = 512 * 1_024
_codec_available: bool | None = None
_DEFAULT_XIAOZHI_WEBSOCKET_URL = "wss://api.tenclass.net/xiaozhi/v1/"
_DEFAULT_XIAOZHI_OTA_URL = "https://api.tenclass.net/xiaozhi/ota/"
_MAX_PROVISIONING_RESPONSE_BYTES = 1_048_576
_BOOTSTRAP_ACCESS_TOKEN = "ASLant"


@dataclass(frozen=True, slots=True)
class XiaozhiSettings:
    enabled: bool = False
    websocket_url: str = _DEFAULT_XIAOZHI_WEBSOCKET_URL
    ota_url: str = _DEFAULT_XIAOZHI_OTA_URL
    local_websocket_url: str = ""
    local_ota_url: str = ""
    access_token: str | None = None
    client_id: str | None = None
    device_id: str | None = None

    @classmethod
    def from_environment(cls) -> XiaozhiSettings:
        return cls(
            enabled=_parse_bool(os.environ.get("CV_XIAOZHI_ENABLED")),
            websocket_url=os.environ.get(
                "CV_XIAOZHI_WEBSOCKET_URL", _DEFAULT_XIAOZHI_WEBSOCKET_URL
            ).strip(),
            ota_url=os.environ.get("CV_XIAOZHI_OTA_URL", _DEFAULT_XIAOZHI_OTA_URL).strip(),
            local_websocket_url=os.environ.get("CV_XIAOZHI_LOCAL_WEBSOCKET_URL", "").strip(),
            local_ota_url=os.environ.get("CV_XIAOZHI_LOCAL_OTA_URL", "").strip(),
            access_token=_optional_env("CV_XIAOZHI_ACCESS_TOKEN"),
            client_id=_optional_env("CV_XIAOZHI_CLIENT_ID"),
            device_id=_normalize_device_id(_optional_env("CV_XIAOZHI_DEVICE_ID")),
        )

    @property
    def connection_ready(self) -> bool:
        return (
            self.enabled
            and self.websocket_url.startswith(("ws://", "wss://"))
            and bool(self.client_id)
            and bool(self.device_id)
        )

    @property
    def pairing_required(self) -> bool:
        return self.connection_ready and not self.access_token

    @property
    def configured(self) -> bool:
        return self.connection_ready and bool(self.access_token)


@dataclass(frozen=True, slots=True)
class XiaozhiProvisioning:
    websocket_url: str | None = None
    access_token: str | None = None
    activation_code: str | None = None
    activation_message: str | None = None


class XiaozhiRemoteError(RuntimeError):
    pass


class XiaozhiProvisioningError(RuntimeError):
    pass


class XiaozhiBridge:
    """Backend-only relay for the Xiaozhi device WebSocket protocol.

    Browser credentials never cross this boundary. The browser sends PCM16 audio
    frames; the bridge converts them to Xiaozhi Opus frames and converts TTS Opus
    frames back to PCM16 for browser playback.
    """

    def __init__(self, settings: XiaozhiSettings, mode: str = "official") -> None:
        self.settings = settings
        self.mode = mode
        self._runtime_websocket_url: str | None = None
        self._runtime_access_token: str | None = None

    def set_mode(self, mode: str) -> None:
        if mode != self.mode:
            self.mode = mode
            self._runtime_websocket_url = None
            self._runtime_access_token = None

    def _active_settings(self) -> XiaozhiSettings:
        if self.mode == "local":
            return replace(
                self.settings,
                websocket_url=self.settings.local_websocket_url,
                ota_url=self.settings.local_ota_url,
                access_token=None,
            )
        return self.settings

    def status(self) -> dict[str, Any]:
        active = self._active_settings()
        websocket_url = self._runtime_websocket_url or active.websocket_url
        configured = active.configured or bool(self._runtime_access_token)
        endpoint = urlsplit(websocket_url)
        return {
            "enabled": active.enabled,
            "mode": self.mode,
            "local_available": (
                active.local_websocket_url.startswith(("ws://", "wss://"))
                and active.local_ota_url.startswith(("http://", "https://"))
            ),
            "configured": configured,
            "pairing_required": active.connection_ready and not configured,
            "codec_available": _codec_is_available(),
            "device_id": _mask_identifier(self.settings.device_id),
            "client_id": _mask_identifier(self.settings.client_id),
            "endpoint_host": endpoint.hostname,
            "input_sample_rate": _INPUT_SAMPLE_RATE,
            "output_sample_rate": _OUTPUT_SAMPLE_RATE,
            "frame_duration_ms": _FRAME_DURATION_MS,
        }

    async def stream(self, browser: WebSocket) -> None:
        active = self._active_settings()
        mode = self.mode
        service_label = "本地服务" if mode == "local" else "在线服务"
        local_available = self.status()["local_available"]
        if not active.connection_ready or (mode == "local" and not local_available):
            await browser.accept()
            if not active.enabled:
                message = "Agent助手服务未启用，请设置 CV_XIAOZHI_ENABLED=true。"
            elif mode == "local" and not local_available:
                message = "本地服务地址未配置，请设置本地 OTA 和 WebSocket 地址。"
            else:
                message = "缺少 Agent助手设备 Client ID 或 Device ID，请先完成设备配置。"
            await browser.send_json(
                {"type": "assistant", "state": "unavailable", "message": message}
            )
            await browser.close(code=1013, reason="assistant is not ready")
            return

        await browser.accept()
        await browser.send_json(
            {
                "type": "assistant",
                "state": "connecting",
                "device_id": _mask_identifier(self.settings.device_id),
            }
        )

        runtime_websocket_url = self._runtime_websocket_url
        runtime_access_token = self._runtime_access_token
        connection_settings = active
        if not active.access_token and not runtime_access_token:
            try:
                provisioning = await asyncio.to_thread(_request_provisioning, active)
            except XiaozhiProvisioningError as error:
                logger.warning("助手设备注册失败: %s", error)
                await _send_error(
                    browser, "无法连接 Agent助手设备注册服务，请检查网络和后端日志后重试。"
                )
                return

            if provisioning.activation_code:
                await browser.send_json(
                    {
                        "type": "assistant",
                        "state": "pairing",
                        "verification_code": provisioning.activation_code,
                        "message": provisioning.activation_message
                        or "请在设备控制面板输入验证码完成设备绑定。",
                        "control_panel_url": (
                            f"{urlsplit(active.ota_url).scheme}://{urlsplit(active.ota_url).netloc}/"
                            if mode == "local"
                            else "https://xiaozhi.me/login"
                        ),
                    }
                )
                await browser.close(code=1000, reason="assistant device pairing required")
                return

            runtime_websocket_url = _runtime_websocket_url(
                mode, active.websocket_url, provisioning.websocket_url
            )
            runtime_access_token = provisioning.access_token
            if self.mode == mode:
                self._runtime_websocket_url = runtime_websocket_url
                self._runtime_access_token = runtime_access_token

        if runtime_websocket_url or runtime_access_token:
            connection_settings = replace(
                active,
                websocket_url=(runtime_websocket_url or active.websocket_url),
                access_token=(runtime_access_token or active.access_token),
            )

        try:
            encoder, decoder = _create_codecs()
        except Exception:
            logger.exception("初始化助手 Opus 编解码器失败")
            await browser.send_json(
                {
                    "type": "assistant",
                    "state": "unavailable",
                    "message": "后端缺少 libopus 编解码运行库（Windows 请执行 conda install -c conda-forge libopus 后重启后端）。",
                }
            )
            await browser.close(code=1011, reason="opus codec unavailable")
            return

        remote: Any | None = None
        try:
            logger.info(
                "正在连接助手服务：service=%s endpoint=%s",
                service_label,
                _safe_websocket_endpoint(connection_settings.websocket_url),
            )
            remote = await _connect(connection_settings)
            await remote.send(json.dumps(_hello_message(), ensure_ascii=False))
            first_message = await asyncio.wait_for(remote.recv(), timeout=10)
            remote_session_id = await self._forward_remote_message(
                browser, decoder, first_message, None
            )
            await browser.send_json(
                {
                    "type": "assistant",
                    "state": "connected",
                    "device_id": _mask_identifier(self.settings.device_id),
                }
            )

            browser_task = asyncio.create_task(
                self._forward_browser_messages(browser, remote, encoder, remote_session_id)
            )
            remote_task = asyncio.create_task(
                self._forward_remote_messages(browser, remote, decoder, remote_session_id)
            )
            done, pending = await asyncio.wait(
                {browser_task, remote_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                error = task.exception()
                if error:
                    raise error
        except asyncio.CancelledError:
            raise
        except XiaozhiRemoteError as error:
            logger.warning("助手服务拒绝会话: %s", error)
            await _send_error(browser, str(error))
        except Exception as error:
            logger.exception(
                "助手会话失败：service=%s endpoint=%s",
                service_label,
                _safe_websocket_endpoint(connection_settings.websocket_url),
            )
            detail = str(error).strip().replace("\n", " ")[:240]
            await _send_error(
                browser,
                f"Agent助手连接失败：{detail or '请检查设备认证、网络和后端日志。'}",
            )
        finally:
            if remote is not None:
                await remote.close()

    async def _forward_browser_messages(
        self,
        browser: WebSocket,
        remote: Any,
        encoder: Any,
        remote_session_id: str | None,
    ) -> None:
        pcm_buffer = bytearray()
        while True:
            message = await browser.receive()
            if message["type"] == "websocket.disconnect":
                return
            if message.get("text") is not None:
                payload = _parse_browser_command(message["text"])
                if payload["type"] == "listen" and payload["state"] == "start":
                    pcm_buffer.clear()
                if payload["type"] == "listen" and payload["state"] == "stop" and pcm_buffer:
                    pcm_buffer.extend(b"\x00" * (_INPUT_FRAME_SAMPLES * 2 - len(pcm_buffer)))
                    await remote.send(encoder.encode(bytes(pcm_buffer), _INPUT_FRAME_SAMPLES))
                    pcm_buffer.clear()
                if remote_session_id:
                    payload["session_id"] = remote_session_id
                await remote.send(json.dumps(payload, ensure_ascii=False))
                continue
            audio = message.get("bytes")
            if not audio:
                continue
            if len(pcm_buffer) + len(audio) > _MAX_AUDIO_BUFFER_BYTES:
                raise ValueError("assistant audio buffer exceeded limit")
            pcm_buffer.extend(audio)
            while len(pcm_buffer) >= _INPUT_FRAME_SAMPLES * 2:
                frame = bytes(pcm_buffer[: _INPUT_FRAME_SAMPLES * 2])
                del pcm_buffer[: _INPUT_FRAME_SAMPLES * 2]
                await remote.send(encoder.encode(frame, _INPUT_FRAME_SAMPLES))

    async def _forward_remote_messages(
        self,
        browser: WebSocket,
        remote: Any,
        decoder: Any,
        remote_session_id: str | None,
    ) -> None:
        async for message in remote:
            remote_session_id = await self._forward_remote_message(
                browser, decoder, message, remote_session_id
            )

    async def _forward_remote_message(
        self,
        browser: WebSocket,
        decoder: Any,
        message: Any,
        remote_session_id: str | None,
    ) -> str | None:
        if isinstance(message, bytes):
            pcm = decoder.decode(message, _OUTPUT_SAMPLE_RATE * 120 // 1_000)
            if pcm:
                await browser.send_bytes(pcm)
            return remote_session_id

        await browser.send_text(message)
        try:
            payload = json.loads(message)
        except (TypeError, json.JSONDecodeError):
            return remote_session_id
        if isinstance(payload, dict) and payload.get("type") in {"stt", "tts"}:
            logger.info(
                "Agent助手协议事件：type=%s state=%s",
                payload.get("type"),
                payload.get("state", "-"),
            )
        if isinstance(payload, dict) and payload.get("type") == "error":
            message_text = payload.get("message")
            detail = message_text.strip()[:240] if isinstance(message_text, str) else ""
            raise XiaozhiRemoteError(detail or "Agent助手服务拒绝了当前设备连接。")
        if isinstance(payload, dict) and payload.get("type") == "hello":
            session_id = payload.get("session_id")
            if isinstance(session_id, str) and session_id:
                return session_id
        return remote_session_id


def _hello_message() -> dict[str, Any]:
    return {
        "type": "hello",
        "version": 1,
        "transport": "websocket",
        "audio_params": {
            "format": "opus",
            "sample_rate": _INPUT_SAMPLE_RATE,
            "channels": _CHANNELS,
            "frame_duration": _FRAME_DURATION_MS,
        },
    }


def _parse_browser_command(raw_message: str) -> dict[str, Any]:
    try:
        payload = json.loads(raw_message)
    except json.JSONDecodeError as error:
        raise ValueError("assistant command must be JSON") from error
    if not isinstance(payload, dict) or payload.get("type") not in {"listen", "abort"}:
        raise ValueError("unsupported assistant command")
    if payload["type"] == "listen":
        state = payload.get("state")
        if state not in {"start", "stop", "detect"}:
            raise ValueError("unsupported listen state")
        if state == "detect":
            text = payload.get("text")
            if not isinstance(text, str) or not text.strip() or len(text) > 1_000:
                raise ValueError("typed assistant question is invalid")
    return payload


def _request_provisioning(settings: XiaozhiSettings) -> XiaozhiProvisioning:
    payload = {
        "version": 2,
        "flash_size": 16_777_216,
        "psram_size": 0,
        "minimum_free_heap_size": 8_318_916,
        "mac_address": settings.device_id,
        "uuid": settings.client_id,
        "chip_model_name": "esp32s3",
        "chip_info": {"model": 9, "cores": 2, "revision": 2, "features": 18},
        "application": {
            "name": "xiaozhi",
            "version": "1.1.2",
            "idf_version": "v5.3.2-dirty",
        },
        "partition_table": [],
        "ota": {"label": "factory"},
        "board": {
            "type": "bread-compact-wifi",
            "ip": _local_ip(),
            "mac": settings.device_id,
        },
    }
    headers = {
        "Activation-Version": "1",
        "Device-Id": settings.device_id or "",
        "Client-Id": settings.client_id or "",
        "User-Agent": "classvision-terminal/1.0",
        "Accept-Language": "zh-CN",
        "Content-Type": "application/json",
    }
    request = urllib_request.Request(
        settings.ota_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        opener = urllib_request.build_opener(urllib_request.ProxyHandler({}))
        with opener.open(request, timeout=10) as response:
            raw_response = response.read(_MAX_PROVISIONING_RESPONSE_BYTES + 1)
    except HTTPError as error:
        detail = error.read(4_096).decode("utf-8", errors="replace").strip()
        raise XiaozhiProvisioningError(f"OTA HTTP {error.code}: {detail[:240]}") from error
    except Exception as error:
        raise XiaozhiProvisioningError("OTA request failed") from error

    if len(raw_response) > _MAX_PROVISIONING_RESPONSE_BYTES:
        raise XiaozhiProvisioningError("OTA response is too large")
    try:
        response = json.loads(raw_response)
    except json.JSONDecodeError as error:
        raise XiaozhiProvisioningError("OTA response is not valid JSON") from error
    if not isinstance(response, dict):
        raise XiaozhiProvisioningError("OTA response has an invalid shape")

    return _parse_provisioning_response(response)


def _parse_provisioning_response(response: dict[str, Any]) -> XiaozhiProvisioning:
    activation = response.get("activation")
    websocket = response.get("websocket")
    activation_code = (
        activation.get("code")
        if isinstance(activation, dict) and isinstance(activation.get("code"), str)
        else None
    )
    activation_message = (
        activation.get("message")
        if isinstance(activation, dict) and isinstance(activation.get("message"), str)
        else None
    )
    websocket_url = (
        websocket.get("url")
        if isinstance(websocket, dict) and isinstance(websocket.get("url"), str)
        else None
    )
    access_token = (
        websocket.get("token")
        if isinstance(websocket, dict) and isinstance(websocket.get("token"), str)
        else None
    )
    return XiaozhiProvisioning(
        websocket_url=websocket_url.strip() if websocket_url else None,
        access_token=access_token.strip() if access_token else None,
        activation_code=activation_code.strip() if activation_code else None,
        activation_message=activation_message.strip() if activation_message else None,
    )


def _runtime_websocket_url(
    mode: str, configured_url: str, provisioning_url: str | None
) -> str | None:
    """Keep local Docker addresses from leaking into a LAN client session."""
    if mode == "local":
        return configured_url
    return provisioning_url


def _safe_websocket_endpoint(url: str) -> str:
    """Return a diagnostic server address without exposing credentials or protocol paths."""
    parsed = urlsplit(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def _codec_is_available() -> bool:
    global _codec_available
    if _codec_available is None:
        try:
            _create_codecs()
        except Exception:
            _codec_available = False
        else:
            _codec_available = True
    return _codec_available


def _create_codecs() -> tuple[Any, Any]:
    import opuslib

    return (
        opuslib.Encoder(_INPUT_SAMPLE_RATE, _CHANNELS, 2_049),
        opuslib.Decoder(_OUTPUT_SAMPLE_RATE, _CHANNELS),
    )


async def _connect(settings: XiaozhiSettings) -> Any:
    headers = {
        "Authorization": f"Bearer {settings.access_token or _BOOTSTRAP_ACCESS_TOKEN}",
        "Protocol-Version": "1",
        "Device-Id": settings.device_id,
        "Client-Id": settings.client_id,
    }
    try:
        return await websockets.connect(
            settings.websocket_url,
            additional_headers=headers,
            max_size=None,
            ping_interval=20,
            ping_timeout=20,
        )
    except TypeError:
        return await websockets.connect(
            settings.websocket_url,
            extra_headers=headers,
            max_size=None,
            ping_interval=20,
            ping_timeout=20,
        )


async def _send_error(browser: WebSocket, message: str) -> None:
    try:
        await browser.send_json({"type": "assistant", "state": "error", "message": message})
        await browser.close(code=1011, reason="assistant bridge error")
    except Exception:
        pass


def _optional_env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def _normalize_device_id(value: str | None) -> str | None:
    return value.lower() if value else None


def _parse_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _mask_identifier(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "••••"
    return f"{value[:4]}••••{value[-4:]}"
