@echo off
chcp 65001 >nul
setlocal

echo ==============================================
echo   智课眼 无感课堂考勤系统 - 一键启动 (Windows)
echo ==============================================

set "ROOT=%~dp0.."

REM [1/4] 定位 conda ClassVision 环境的 Python（不自动 pip 安装后端依赖）
set "CONDA_PYTHON=%USERPROFILE%\.conda\envs\ClassVision\python.exe"
if not exist "%CONDA_PYTHON%" (
    echo [错误] 未找到 conda 环境 ClassVision 的 Python：
    echo        %CONDA_PYTHON%
    echo   请先创建环境：conda create -n ClassVision python=3.11
    echo   并安装依赖：conda activate ClassVision ^&^& pip install -r backend\requirements.txt
    pause
    exit /b 1
)
echo [1/4] 后端环境：%CONDA_PYTHON%

REM [2/4] 初始化数据库（仅在首次/无数据库时执行，避免覆盖已有数据）
if not exist "%ROOT%\backend\classvision.db" (
    echo [2/4] 初始化数据库...
    "%CONDA_PYTHON%" "%ROOT%\scripts\init_db.py"
) else (
    echo [2/4] 数据库已存在，跳过初始化
)

REM [3/4] 前端依赖（仅首次安装）
if not exist "%ROOT%\admin-web\node_modules" (
    echo [3/4] 安装管理端依赖...
    pushd "%ROOT%\admin-web"
    call npm install
    popd
)
if not exist "%ROOT%\student-web\node_modules" (
    echo [3/4] 安装学生端依赖...
    pushd "%ROOT%\student-web"
    call npm install
    popd
)
echo [3/4] 前端依赖就绪

REM [4/4] 启动服务
echo [4/4] 启动服务...
start "智课眼-后端" /d "%ROOT%\backend" "%CONDA_PYTHON%" run.py
start "智课眼-管理端" /d "%ROOT%\admin-web" cmd /k "npm run dev"
start "智课眼-学生端" /d "%ROOT%\student-web" cmd /k "npm run dev"

REM 等待后端就绪后，自动用默认浏览器打开管理端页面
echo.
echo 正在等待后端就绪...
set /a RETRY=0
:wait_backend
curl -s -o nul http://localhost:8000/ 2>nul
if %ERRORLEVEL% EQU 0 goto backend_ready
set /a RETRY+=1
if %RETRY% GEQ 40 (
    echo [提示] 后端启动超时，请稍后手动访问 http://localhost:5173
    goto done
)
timeout /t 1 /nobreak >nul
goto wait_backend

:backend_ready
echo 后端已就绪，稍候自动打开管理端页面...
timeout /t 3 /nobreak >nul
start "" http://localhost:5173

:done
echo.
echo ==============================================
echo   后端:   http://localhost:8000/docs
echo   管理端: http://localhost:5173   (账号 admin / admin123)
echo   学生端: http://localhost:5174   (学号 / 123456)
echo ==============================================
echo 已启动，浏览器将自动打开管理端。请保留各服务窗口，关闭窗口即停止对应服务。
pause
endlocal
