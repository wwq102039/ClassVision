"""启动入口：uvicorn 拉起 FastAPI 应用。"""
from __future__ import annotations

import uvicorn

from app.main import app, init_db_if_needed


def main() -> None:
    init_db_if_needed()
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    init_db_if_needed()
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)