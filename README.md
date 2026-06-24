# Clipwise

Clipwise 是一个本地优先的 AI 直播回放智能切片工具，帮助创作者从长视频中快速找到高价值片段，并导出可发布的视频素材、字幕和文案。

## 核心特点

- **原始视频不上传**：浏览器只在本地读取视频，用于预览和导出。
- **音频压缩后分析**：前端提取压缩音频，后端用于 ASR 和候选片段生成。
- **AI 推荐切片**：自动识别高价值片段，生成标题、摘要、金句、字幕和剪辑建议。
- **人工审片工作台**：支持预览、编辑文案、调整字幕、查看推荐理由和风险提示。
- **本地导出素材**：导出 MP4、SRT、TXT 等发布所需文件。

## 技术栈

- Monorepo：pnpm workspace
- Web：Next.js、React、TypeScript、CSS Modules
- 数据库：PostgreSQL、Drizzle ORM
- Worker：Python、asyncpg
- AI：
  - Groq Whisper：语音识别
  - DeepSeek：高光候选片段生成

## 项目结构

```text
apps/web/          Next.js Web 应用
packages/shared/   前后端共享类型和 fixtures
services/worker/   后台任务 Worker
infra/             本地基础设施配置
```

## 本地运行

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动数据库

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

### 3. 配置环境变量

复制示例文件并填入真实 key：

```bash
cp .env.example apps/web/.env
cp services/worker/.env.example services/worker/.env
```

至少需要：

```bash
DATABASE_URL=postgres://clipwise:clipwise_dev@localhost:5432/clipwise
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...
```

不要提交真实 `.env` 文件。

### 4. 启动 Web + Worker

一条命令同时启动前端和后台 Worker（推荐）：

```bash
pnpm dev:all
```

默认访问：

```text
http://localhost:3000
```

如果只做前端开发，也可以单独启动 Web：

```bash
pnpm dev
```

此时上传视频后任务会停在"等待开始 / 0%"，需要另起 Worker：

```bash
pnpm worker:run
```

> **端口冲突**：若 3000 被占用，Next 会自动改用 3001。Web 内部已不依赖固定端口（服务端直接查库），任意端口均可正常工作。

### 5. 已知扩展瓶颈

- **任务进度推送是数据库轮询**：SSE 端点（`/api/tasks/[taskId]/events`）每秒查一次 jobs 表，而非 Postgres 原生的 `LISTEN/NOTIFY`。单机 MVP 足够，但并发任务多时是 N×QPS 的恒定 DB 压力。中期可改用 `pg_notify` 推送 + 轮询兜底。

## 常用命令

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## 隐私说明

Clipwise 的设计目标是本地优先：

- 原始视频文件留在用户浏览器本地。
- 服务端只接收压缩音频和生成后的分析结果。
- ASR 成功或失败后，Worker 都会清理临时音频文件。
- 项目数据（候选、字幕、转写）按 `expires_at` 定期清理（Worker 每 30 分钟扫描一次过期项目）。

## 当前状态

这是一个 MVP 阶段项目，重点覆盖直播回放上传、AI 分析、候选片段审阅和本地导出流程。
