# Clipwise Phase 3 任务进度与编辑保存 Implementation Plan

> **面向执行代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，严格按任务逐项实施。所有步骤使用复选框（`- [ ]`）跟踪。每个任务严格遵循 TDD 节奏：先写失败测试 → 确认 FAIL → 最小实现 → 确认 PASS → 提交。

**目标：** 实现 design §14 的任务进度订阅（SSE + 5 秒轮询兜底）和 §6 的候选编辑自动保存，让用户能实时看到"创建项目 → 处理中 → 候选就绪"的进度，并让标题/摘要/字幕的修改真正持久化到数据库。

**架构：**
- **SSE 路由** `GET /api/tasks/:taskId/events`：Next.js Route Handler 用 `ReadableStream` 实现，每秒查 `jobs` 表推送 `TaskProgressEvent`，任务终态后关闭流。
- **任务页** `/project/[token]/tasks/[taskId]`：Server Component 做 SSR 首帧，Client Component 用 `EventSource` 订阅 SSE，断线时启用 5 秒轮询兜底。
- **项目页自动跳转**：访问 `/project/[token]` 时若 `status !== "ready"`，Server Component `redirect()` 到对应任务页（从 `jobs` 表反查 `taskId`）。
- **编辑保存**：新增 `lib/candidate-api.ts` 的 `patchCandidate`，EditorTabs 的 autosave 改调它（不走 `ProjectProvider.saveProject`）。
- **重新生成接通**：CandidateList 的「重新生成候选」按钮接 onClick，调 `POST /api/projects/:token/regenerate` 拿 taskId 后跳任务页。
- **上传链路保持现状**：本 plan 不动 `startAnalysis`（仍跳 `demo-project`），真实上传留给 Phase 4（需 ffmpeg.wasm）。

**技术栈：** Next.js 16.2.9（Route Handler + ReadableStream）、原生 `EventSource`（无第三方库）、Drizzle ORM、React 19。

---

## 已做决策（4 个关键问题）

| 问题 | 决策 | 理由 |
|---|---|---|
| 上传链路 | **保持 demo-project，不接真上传** | 前端零音频提取代码（ffmpeg.wasm 在 Phase 4）；SSE 用现有集成测试的命令行流程验证 |
| 进度推送 | **SSE 为主 + 5 秒轮询兜底** | design §14 原方案；本地开发 SSE 完美，Vercel serverless 长连接问题由 5 秒兜底缓解 |
| 项目页非 ready 态 | **自动跳转任务页** | 用户永远只在一个地方看进度；从 jobs 表反查 taskId |
| 编辑保存 | **新增 patchCandidate 函数，不走 Provider** | autosave 是单候选防抖，Provider 是整项目保存，粒度不匹配 |

## 本 plan 覆盖范围（对应 design §14 / §6）

**覆盖：**
- SSE 路由 `GET /api/tasks/:taskId/events`（替换 501 占位）
- 任务页 `/project/[token]/tasks/[taskId]`（Server + Client Component）
- 前端 `useTaskProgress` Hook（EventSource + 5 秒轮询兜底 + 8 秒静默检测）
- 任务完成后一次性拉 `GET /api/projects/:token/clips` 跳项目页
- 项目页非 ready 时 `redirect()` 到任务页
- 编辑保存：`lib/candidate-api.ts` + EditorTabs 接通
- 重新生成按钮接通 + regenerationCount 禁用
- 失败重试按钮接通

**明确不实现（留给后续阶段）：**
- 真实上传链路（ffmpeg.wasm 音频提取，Phase 4）
- 真实 Groq/DeepSeek（Phase 4/5）
- 本地 MP4/SRT/TXT 导出（Phase 6，ExportPanel 占位文案保留）
- 服务端字幕烧录 / ZIP（Phase 6）
- 任务页的真实重试（本 plan 只 UI 接通，重投递逻辑 Phase 4）

---

## 二、任务清单

### 任务 1：SSE 路由实现（替换 501 占位）

SSE 路由用 `ReadableStream` 实现，每秒查 jobs 表推送 `TaskProgressEvent`，终态推 `completed`/`failed` 并关闭流。event name 四种：`progress` / `completed` / `failed` / `heartbeat`。`id` 用 `updatedAt` 时间戳。文案约束：message 字段已是产品化文字（"正在识别语音"等），无日志/模型名。

### 任务 2：进度状态机纯函数

`shouldAdvanceProgress`（进度不倒退）、`isTerminal`、`isCompleted`、`isFailed`。

### 任务 3：useTaskProgress Hook（SSE + 轮询兜底）

`EventSource` 订阅 + 8 秒静默检测 + online/visibilitychange → 5 秒轮询兜底；SSE 恢复立即停轮询；completed 后只调一次 `onCompleted`；卸载清理所有定时器与 EventSource。

### 任务 4：candidate-api + EditorTabs 接通

新增 `lib/candidate-api.ts` 的 `patchCandidate(token, candidate)`；EditorTabs props 加 `token`，save 改调 patchCandidate；editor-tabs 测试 mock fetch 避免 500ms 后变 failed。

### 任务 5：CandidateList 重新生成按钮接通

按钮接 onClick（fetch regenerate → 跳任务页）；regenerationCount >= 1 时 disabled。

### 任务 6：任务页（Server + Client Component）

Server Component 做 SSR 首帧 + succeeded 时 redirect 项目页；TaskProgressClient 订阅 SSE + 进度条 UI + failed 重试按钮。

### 任务 7：项目页非 ready 时跳转任务页

访问 `/project/[token]` 时若 status 非 ready，从 jobs 表反查最新 taskId，redirect 到任务页。

### 任务 8：端到端集成验证

SSE 流测试（创建→订阅→completed→拉 clips）+ 验收记录 `docs/phase-3-verification.md`。

---

## 三、规格覆盖检查

### design §14 覆盖
- [x] §14.1 任务页路由 `/project/[token]/tasks/[taskId]`（任务 6）
- [x] §14.2 TaskProgressEvent 格式 + 4 种事件类型（任务 1）
- [x] §14.2 文案约束（复用 Worker STAGE_MESSAGES）
- [x] §14.2 SSE id 用 updatedAt（任务 1）
- [x] §14.3 每秒查询 DB（任务 1）
- [x] §14.3 终态推最终事件并关闭流（任务 1）
- [x] §14.4 5 秒轮询兜底 + 4 种触发（任务 3）
- [x] §14.4 SSE 恢复后停轮询（任务 3）
- [x] §14.5 completed 后一次性拉 clips（任务 3 + 6）
- [x] §14.6 测试 8 条（任务 3 + 任务 8）

### design §6 覆盖
- [x] 防抖自动保存（任务 4）
- [x] SaveStatus 状态机展示（SaveIndicator 已有）
- [x] 刷新后恢复服务端状态（任务 7 redirect）

### design §9.5 覆盖
- [x] 重新生成复用 transcript（任务 5 接 onClick）
- [x] regenerationCount <= 1 限制（任务 5 禁用 + 后端 409）

### 本计划明确不实现
- ❌ 真实上传链路 / ffmpeg.wasm（Phase 4）
- ❌ 真实 Groq/DeepSeek（Phase 4/5）
- ❌ 本地导出 MP4/SRT/TXT（Phase 6）
- ❌ 服务端字幕烧录 / ZIP（Phase 6）
- ❌ 真实失败重投递逻辑（Phase 4）
