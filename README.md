# 智课眼 ClassVision

> 面向课堂场景的**无感考勤与学情分析系统**。教师在管理端发起课堂，摄像头实时检测并跟踪画面中的每一张人脸，自动完成签到、迟到判定与统计报表；学生在移动端查看个人考勤、提交申诉。

<p>
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white" alt="python">
  <img src="https://img.shields.io/badge/FastAPI-0.110%2B-009688?logo=fastapi&logoColor=white" alt="fastapi">
  <img src="https://img.shields.io/badge/ONNX%20Runtime-1.17%2B-005CED?logo=onnx&logoColor=white" alt="onnx">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="react">
  <img src="https://img.shields.io/badge/Vue-3-42B883?logo=vuedotjs&logoColor=white" alt="vue">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" alt="sqlite">
</p>

---

## 目录

- [核心特性](#核心特性)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [API 概览](#api-概览)
- [关键技术实现](#关键技术实现)
- [测试](#测试)
- [已知限制](#已知限制)
- [路线图](#路线图)
- [许可](#许可)

---

## 核心特性

- **无感考勤**：无需学生刷卡或扫码，摄像头画面中出现人脸即视为到场，按课程时间自动判定 `出勤 / 迟到 / 缺勤`。
- **课堂实时监测**：管理端提供在线人数、识别结果、未识别快照与课堂热力图。
- **两级多目标跟踪**：先用 IoU 做帧间贪心关联，仅对未匹配目标提取 ReID 特征做余弦关联——稳定场景下不跑特征模型，跟踪耗时只随人脸数线性增长。
- **三级特征提取回退**：`insightface → face_recognition → 内置降级实现`，缺哪个可选依赖都能跑，不因可选库缺席导致系统起不来。
- **人脸数据加密落盘**：抓拍照与底库照片以 AES 加密存储在 `storage/`，对外只通过解密只读路由暴露，避免明文图片被直接访问。
- **申诉闭环**：学生端提交考勤申诉，教师在管理端审核，状态流转留痕（审计日志）。
- **报表导出**：按课程 / 班级 / 时间区间导出考勤统计（Excel）。
- **AI 语音助手**：集成小智语音桥接（WebSocket + Opus）与本地 MCP 只读工具服务，可用自然语言查询班级名单、学生考勤情况。

## 系统架构

```
┌─────────────────────┐        ┌─────────────────────┐
│   admin-web (5173)  │        │  student-web (5174) │
│  React 18 + antd 5  │        │    Vue 3 + Vant 4   │
└──────────┬──────────┘        └──────────┬──────────┘
           │  Vite proxy /api /static      │
           └───────────────┬───────────────┘
                           ▼
              ┌────────────────────────────┐
              │   FastAPI  (uvicorn :8000) │
              │        /api/v1/*           │
              ├────────────────────────────┤
              │ api/routes   ← 接口层        │
              │ services     ← 业务规则      │
              │ ai           ← 检测/跟踪/比对 │
              │ models       ← SQLAlchemy   │
              │ schemas      ← Pydantic     │
              │ core         ← 安全/异常/审计 │
              │ assistant    ← 语音 + MCP    │
              └───────┬────────────┬───────┘
                      │            │
          ┌───────────▼──┐   ┌─────▼─────────────┐
          │  SQLite      │   │ ONNX Runtime      │
          │ classvision  │   │ yolov8n_face.onnx │
          └──────────────┘   │ + insightface     │
                             └───────────────────┘
```

## 技术栈

| 层 | 选型 |
|---|---|
| 后端框架 | Python 3.11 · FastAPI 0.110+ · Uvicorn |
| 数据访问 | SQLAlchemy 2.0 · SQLite（可替换 PostgreSQL） |
| 数据校验 | Pydantic 2.x |
| 人脸检测 | 自训练 YOLOv8n-face，导出 **ONNX**（默认） / ultralytics PT（备选） |
| 特征提取 | insightface（默认）→ face_recognition → 内置降级 |
| 跟踪 | 自研 IoU + ReID 两级关联（无第三方跟踪库） |
| 安全 | JWT（pyjwt）· AES 文件加密（cryptography）· 审计日志 |
| 管理端 | React 18 · TypeScript · Ant Design 5 · Vite · LESS |
| 学生端 | Vue 3 · Vant 4 · Vite |
| AI 助手 | 小智语音桥接（websockets · opuslib）· MCP（fastmcp · mcp-proxy） |
| 日志 | loguru |

## 目录结构

```
classvision/
├── backend/
│   ├── app/
│   │   ├── main.py              # 应用入口：路由挂载、异常处理、静态解密路由
│   │   ├── config.py            # 全部配置项（环境变量 + 内置默认值）
│   │   ├── api/
│   │   │   ├── deps.py          # 依赖注入（当前用户、DB 会话）
│   │   │   └── routes/          # 9 个业务路由模块
│   │   ├── ai/
│   │   │   ├── detector.py      # 人脸检测：手写 ONNX 推理（letterbox + NMS）
│   │   │   ├── embedder.py      # 特征提取：三级后端回退
│   │   │   ├── tracker.py       # 多目标跟踪：IoU + ReID 关联
│   │   │   ├── matcher.py       # 余弦相似度身份判定
│   │   │   └── inference.py     # 推理编排与图像解码
│   │   ├── services/            # 考勤规则、申诉、报表、人脸库
│   │   ├── models/              # SQLAlchemy 模型（6 张表）
│   │   ├── schemas/             # Pydantic 模型
│   │   ├── core/                # 安全、异常、统一响应、审计
│   │   └── assistant/           # 小智语音 + MCP 工具服务
│   ├── tests/test_tracking.py   # 跟踪稳定性集成测试
│   └── requirements.txt
├── admin-web/                   # 教师管理端（React + antd）
│   └── src/{api,components,layouts,pages,styles,theme,utils}
├── student-web/                 # 学生端（Vue3 + Vant）
│   └── src/{api,components,router,views}
├── model/
│   ├── yolov8n_face.onnx        # 运行时实际加载的模型
│   └── yolov8n_face.pt          # 训练原始权重
├── docs/
│   ├── 技术方案与架构说明.md      # 详细设计文档
│   └── 智课眼AI助手提示词.txt     # 助手系统提示词与工具定义
└── scripts/
    ├── init_db.py               # 建表 + 种子数据
    ├── start_all.bat            # Windows 一键启动
    └── start_all.sh             # Linux / macOS 一键启动
```

## 快速开始

### 环境要求

- Python **3.11**
- Node.js **≥ 18**
- 本地摄像头（演示用）

### 1. 后端

```bash
conda create -n ClassVision python=3.11 -y
conda activate ClassVision
cd backend
pip install -r requirements.txt
```

> `insightface`、`face_recognition`、`ultralytics` 为**可选增强项**：未安装时系统会自动回退到降级实现，不影响启动与基本识别。

初始化数据库（建表并写入演示课程与 5 名学生）：

```bash
python ../scripts/init_db.py
```

启动服务：

```bash
python run.py          # http://localhost:8000
```

接口文档：<http://localhost:8000/docs>

### 2. 管理端（教师）

```bash
cd admin-web
npm install
npm run dev            # http://localhost:5173
```

### 3. 学生端

```bash
cd student-web
npm install
npm run dev            # http://localhost:5174
```

### 4. 一键启动（Windows）

```bat
scripts\start_all.bat
```

脚本会依次检查 conda 环境、初始化数据库、安装前端依赖并拉起三个服务。

### 首次使用

1. 用 `CV_ADMIN_USERNAME` / `CV_ADMIN_PASSWORD`（默认 `admin` / `admin123`）登录管理端；
2. 在**人脸库管理**中为学生导入证件照，构建特征底库；
3. 创建课程 → 发起课堂 → 打开**课堂监测**页接入摄像头。

> ⚠️ 默认账号仅用于本地演示，部署前请务必修改。

## 配置说明

所有配置集中在 `backend/app/config.py`，均支持环境变量覆盖且有内置默认值（零配置可运行）。
复制 `backend/.env.example` 为 `backend/.env` 后按需修改，`.env` 已被 `.gitignore` 排除。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CV_DB_URL` | `sqlite:///classvision.db` | 数据库连接串 |
| `CV_DETECTOR_BACKEND` | `auto` | `auto` / `onnx` / `pt` |
| `CV_EMBEDDER_BACKEND` | `auto` | `auto` / `insightface` / `face_recognition` / `fallback` |
| `CV_MATCH_THRESHOLD` | `0.5` | 余弦相似度身份判定阈值 |
| `CV_LATE_GRACE_MINUTES` | `10` | 迟到宽限分钟数 |
| `CV_CLASS_START_HOUR` / `CV_CLASS_START_MINUTE` | `8` / `0` | 默认上课时间 |
| `CV_TOKEN_SECRET` | 开发占位值 | JWT 签名密钥，**部署必须替换** |
| `CV_ADMIN_USERNAME` / `CV_ADMIN_PASSWORD` | `admin` / `admin123` | 初始管理员 |
| `CV_MCP_ENABLED` | `false` | 是否启用本地 MCP 工具服务 |

完整列表见 `backend/app/config.py` 与 `backend/.env.example`。

## API 概览

统一前缀 `/api/v1`，完整定义见 `/docs`（Swagger UI）。

| 模块 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 认证 | POST | `/auth/login` | 教师 / 学生登录，返回 JWT |
| 学生 | GET / POST | `/students` | 学生列表 / 新增 |
| 学生 | GET / PUT / DELETE | `/students/{id}` | 详情 / 修改 / 删除 |
| 课程 | GET / POST | `/courses` | 课程列表 / 新增 |
| 课程 | PUT / DELETE | `/courses/{id}` | 修改 / 删除 |
| 人脸库 | POST | `/faces/import` | 导入学生照片并提取特征 |
| 课堂 | GET / POST | `/sessions` | 课堂列表 / 发起课堂 |
| 课堂 | GET | `/sessions/{id}/monitor` | 实时监测快照 |
| 课堂 | GET | `/sessions/{id}/heatmap` | 课堂热力图数据 |
| 课堂 | POST | `/sessions/{id}/end` | 结束课堂并结算 |
| 识别 | POST | `/recognition/recognize` | 单帧识别（检测 + 特征 + 比对 + 落库） |
| 识别 | POST | `/recognition/detect` | 仅检测人脸框 |
| 识别 | POST | `/recognition/track` | 连续帧跟踪（维持稳定 ID） |
| 识别 | POST | `/recognition/track/reset` | 重置跟踪器状态 |
| 考勤 | GET | `/attendance` | 课堂考勤明细（教师） |
| 考勤 | GET | `/attendance/mine` | 个人考勤（学生） |
| 考勤 | POST | `/attendance/checkin` | 学生端补签 |
| 考勤 | POST | `/attendance/appeal` | 提交申诉 |
| 申诉 | GET | `/appeals` | 申诉列表 |
| 申诉 | POST | `/appeals/{id}/review` | 审核申诉 |
| 报表 | GET | `/reports/export` | 导出考勤统计 Excel |
| 助手 | GET | `/assistant/status` | 语音桥接状态 |
| 助手 | GET | `/mcp/status` | MCP 服务状态 |

## 关键技术实现

### 1. 手写 ONNX 推理管线（`ai/detector.py`）

不使用 `ultralytics` 的高层封装，直接对接 `onnxruntime`：

- `_letterbox()`：等比缩放 + 灰边填充，记录缩放比与左上角偏移；
- 输出解析：筛选置信度、还原到原图坐标系、按类别聚合；
- `_nms()`：用 NumPy 实现非极大值抑制，按 IoU 阈值抑制重叠框。

收益：推理过程不依赖 ultralytics，可部署到无 PyTorch 的环境；坐标还原与后处理完全可控，便于针对课堂场景调参。

### 2. IoU + ReID 两级关联跟踪（`ai/tracker.py`）

每帧流程：`检测 → IoU 贪心关联已有轨迹（不提取特征）→ 仅对未匹配的检测提取 ReID 特征、与未匹配轨迹做余弦关联 → 轨迹生命周期管理（出现 / 更新 / 丢失 / 消亡）`。

稳定场景下每帧只计算「检测 + IoU」，特征模型完全不参与，跟踪耗时随人脸数线性增长。

### 3. 三级特征提取回退（`ai/embedder.py`）

`insightface`（精度最高，需 numpy<2）→ `face_recognition`（依赖 dlib，Windows 编译成本高）→ 内置降级实现。
启动时按可用性自动选择，保证在只装了基础依赖的机器上也能跑通全流程。
`embed(fast=True)` 可跳过 insightface 内部的人脸对齐重检测，用于实时跟踪等对速度敏感的连续帧场景。

### 4. 人脸数据加密存储（`core/security.py` + `main.py`）

抓拍照与底库照片不以明文落在静态目录：写入前 AES 加密，读取时经 `/static/{subdir}/{filename}` 解密后以 `image/jpeg` 返回。即使拿到 `storage/` 目录也无法直接查看人脸图片。

### 5. AI 语音助手与 MCP 工具（`assistant/`）

- `xiaozhi.py`：对接小智语音协议的 WebSocket 桥接，支持 Opus 音频编解码；
- `mcp_service.py` / `mcp_bridge.py`：以 fastmcp 起本地只读工具服务，让模型能查询班级名单与学生考勤；
- 工具定义与系统提示词见 `docs/智课眼AI助手提示词.txt`，明确约束「不主动泄露学生学号、姓名等敏感信息」。

## 测试

使用 pytest：

```bash
cd backend
python -m pytest tests -q
```

`tests/test_tracking.py` 是跟踪稳定性集成测试：从加密底库解出一张真实人脸，合成「三张同源人脸沿三条水平车道匀速移动 15 帧」的序列，断言跟踪器输出 **3 个稳定且互不串号的 ID**。

## 已知限制

诚实记录当前不足（也是路线图的输入）：

- **数据库为 SQLite 单机**，未使用迁移工具（Alembic），并发写入能力有限；
- **测试覆盖率低**：目前只有跟踪模块的 1 个集成测试，业务规则（迟到判定、申诉流转）缺少单测；
- **未容器化**：部署依赖 `scripts/start_all.*` 与本地环境，缺少 Dockerfile / compose；
- **无性能基准**：未做压测，并发与延迟数据尚未采集；
- **安全默认值偏弱**：默认管理员口令与 JWT 密钥为演示值，部署前必须覆盖；
- **CORS 全开**（`allow_origins=["*"]`），仅适合本地开发；
- **前端存在超大单文件组件**（`Monitor.tsx`、`AssistantFloatingWindow.vue`），待拆分。

## 路线图

- [ ] SQLite → PostgreSQL，引入 Alembic 管理迁移
- [ ] 补业务规则单元测试，覆盖率目标 60%+
- [ ] Docker Compose 一键起全栈（backend + 双前端 + DB）
- [ ] locust 压测，产出识别接口 QPS / P95 延迟基准
- [ ] CORS 白名单化，启动时校验默认密钥并 fail fast
- [ ] 拆分巨型前端组件
- [ ] 数据工程化：考勤数据 ODS / DWD / DWS / ADS 分层 + 日调度

## 许可

本项目为个人学习与研究作品，目前未附加开源许可证。如需引用或用于商业场景，请先联系作者。

---

设计细节与模块说明见 [`docs/技术方案与架构说明.md`](docs/技术方案与架构说明.md)。
