#!/usr/bin/env bash
set -e
echo "=============================================="
echo "  智课眼 无感课堂考勤系统 - 一键启动 (Linux/macOS)"
echo "=============================================="

cd "$(dirname "$0")/.."

if [ ! -d ".venv" ]; then
  echo "[1/5] 创建虚拟环境..."
  python3 -m venv .venv
fi

echo "[2/5] 安装后端依赖..."
source .venv/bin/activate
pip install -r backend/requirements.txt -q

echo "[3/5] 初始化数据库..."
python scripts/init_db.py

echo "[4/5] 安装前端依赖..."
[ -d "admin-web/node_modules" ] || (cd admin-web && npm install)
[ -d "student-web/node_modules" ] || (cd student-web && npm install)

echo "[5/5] 启动服务..."
echo "  后端:   http://localhost:8000/docs"
echo "  管理端: http://localhost:5173"
echo "  学生端: http://localhost:5174"

(cd backend && python run.py) &
(cd admin-web && npm run dev) &
(cd student-web && npm run dev) &

wait
