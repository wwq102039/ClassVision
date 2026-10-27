from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import threading
from contextlib import suppress
from typing import Any

import websockets

from loguru import logger

_PROXY_ENV_KEYS = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
)


def _mcp_proxy_subprocess_env() -> dict[str, str]:
    """mcp_proxy 只访问本机 SSE，不能继承会把 127.0.0.1 转去局域网代理的环境变量。"""
    env = os.environ.copy()
    for key in _PROXY_ENV_KEYS:
        env.pop(key, None)
    local_hosts = "127.0.0.1,localhost"
    existing = env.get("NO_PROXY") or env.get("no_proxy") or ""
    merged = ",".join(part for part in (existing, local_hosts) if part)
    env["NO_PROXY"] = merged
    env["no_proxy"] = merged
    return env


class OfficialMcpBridge:
    """将本地 SSE MCP 服务桥接到在线 WebSocket MCP 接入点。"""

    def __init__(self, endpoint_url: str, local_sse_url: str) -> None:
        self.endpoint_url = endpoint_url
        self.local_sse_url = local_sse_url
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._process: subprocess.Popen[str] | None = None
        self._websocket: Any | None = None
        self._active_tasks: set[asyncio.Task[Any]] = set()
        self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    def start(self) -> bool:
        if self._thread and self._thread.is_alive():
            return True
        if not self.endpoint_url:
            return False

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._run_thread,
            name="official-mcp-bridge",
            daemon=True,
        )
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop_event.set()
        loop = self._loop
        if loop and loop.is_running():
            loop.call_soon_threadsafe(self._cancel_active_tasks)
            if self._websocket is not None:
                future = asyncio.run_coroutine_threadsafe(self._close_websocket(), loop)
                with suppress(Exception):
                    future.result(timeout=2.0)
        self._terminate_process()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=3.0)
        self._thread = None
        self._loop = None
        self._websocket = None
        self._connected = False

    def _run_thread(self) -> None:
        asyncio.run(self._run_forever())

    async def _run_forever(self) -> None:
        self._loop = asyncio.get_running_loop()
        backoff = 1
        while not self._stop_event.is_set():
            try:
                await self._connect_once()
                backoff = 1
            except asyncio.CancelledError:
                raise
            except Exception as error:
                if self._stop_event.is_set():
                    break
                logger.warning("在线 MCP 桥接断开，%ss 后重连: %s", backoff, error)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60)

    async def _connect_once(self) -> None:
        logger.info("连接在线 MCP 服务")
        async with websockets.connect(self.endpoint_url) as websocket:
            self._websocket = websocket
            self._connected = True
            logger.info("在线 MCP 服务已连接")
            process = self._start_proxy_process()
            stop_task = asyncio.create_task(self._wait_for_stop())
            tasks = {
                asyncio.create_task(self._pipe_websocket_to_process(websocket, process)),
                asyncio.create_task(self._pipe_process_to_websocket(process, websocket)),
                asyncio.create_task(self._pipe_process_stderr(process)),
                stop_task,
            }
            self._active_tasks = tasks
            try:
                done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                if stop_task in done and self._stop_event.is_set():
                    return
                for task in done:
                    if task is stop_task or task.cancelled():
                        continue
                    error = task.exception()
                    if error is not None:
                        raise error
            finally:
                self._active_tasks = set()
                self._connected = False
                self._websocket = None
                self._terminate_process()

    def _start_proxy_process(self) -> subprocess.Popen[str]:
        command = [sys.executable, "-m", "mcp_proxy", self.local_sse_url]
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            env=_mcp_proxy_subprocess_env(),
        )
        self._process = process
        logger.debug("MCP 代理进程已启动")
        return process

    async def _pipe_websocket_to_process(
        self,
        websocket: Any,
        process: subprocess.Popen[str],
    ) -> None:
        stdin = process.stdin
        if stdin is None:
            raise RuntimeError("mcp_proxy stdin 不可用")
        while not self._stop_event.is_set():
            message = await websocket.recv()
            if isinstance(message, bytes):
                message = message.decode("utf-8")
            stdin.write(message + "\n")
            stdin.flush()

    async def _pipe_process_to_websocket(
        self,
        process: subprocess.Popen[str],
        websocket: Any,
    ) -> None:
        stdout = process.stdout
        if stdout is None:
            raise RuntimeError("mcp_proxy stdout 不可用")
        while not self._stop_event.is_set():
            line = await asyncio.to_thread(stdout.readline)
            if not line:
                exit_code = process.poll()
                raise RuntimeError(f"mcp_proxy stdout 已结束 (exit_code={exit_code})")
            await websocket.send(line)

    async def _pipe_process_stderr(self, process: subprocess.Popen[str]) -> None:
        stderr = process.stderr
        if stderr is None:
            return
        while not self._stop_event.is_set():
            line = await asyncio.to_thread(stderr.readline)
            if not line:
                return
            logger.warning("在线 MCP 代理: %s", line.rstrip())

    async def _wait_for_stop(self) -> None:
        await asyncio.to_thread(self._stop_event.wait)

    async def _close_websocket(self) -> None:
        websocket = self._websocket
        if websocket is None:
            return
        with suppress(Exception):
            await websocket.close()

    def _cancel_active_tasks(self) -> None:
        for task in tuple(self._active_tasks):
            task.cancel()

    def _terminate_process(self) -> None:
        process = self._process
        self._process = None
        if process is None:
            return
        try:
            process.terminate()
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        except Exception as error:
            logger.warning("停止 MCP 代理进程失败: %s", error)
