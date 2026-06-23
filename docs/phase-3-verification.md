# Clipwise 第三阶段验收记录

验收日期：2026-06-23

## 自动验证

| 检查项 | 结果 |
|---|---|
| `pnpm test`（vitest 单测，排除集成） | ✅ 33 文件 / 82 测试通过 |
| `pnpm test:e2e`（chromium + webkit） | ✅ 8 测试通过 |
| `pnpm lint`（ESLint） | ✅ 0 errors / 0 warnings |
| `pnpm build`（Next.js 生产构建） | ✅ 含新路由 `/project/[token]/tasks/[taskId]` |
| 集成测试 `tests/integration/sse-flow.test.ts` | ✅ SSE 流完整（需 live 服务） |

## 链路验证（design §17.3 / §14.6）

- ✅ SSE 路由 `GET /api/tasks/:taskId/events` 每秒推送 `TaskProgressEvent`
- ✅ 任务终态推送 `completed`/`failed` 事件并关闭流
- ✅ `useTaskProgress` Hook：EventSource 订阅 + 8 秒静默检测 + 5 秒轮询兜底
- ✅ SSE 恢复后立即停止轮询
- ✅ 进度单调递增，不倒退
- ✅ `completed` 后只触发一次 `onCompleted`（跳项目页）
- ✅ 编辑保存：改标题/摘要/字幕 → 500ms 防抖 → PATCH → DB 持久化
- ✅ 重新生成按钮：onClick 接通（fetch regenerate → 跳任务页），regenerationCount >= 1 禁用
- ✅ 项目页非 ready 时 redirect 到任务页（从 jobs 表反查 taskId）
- ✅ 任务页 SSR 首帧 + succeeded 时 redirect 项目页

## design §14 覆盖

| 条款 | 状态 |
|---|---|
| §14.1 任务页路由 | ✅ |
| §14.2 TaskProgressEvent + 4 种事件 | ✅ |
| §14.2 文案约束（无模型名/日志） | ✅ |
| §14.2 SSE id 用 updatedAt | ✅ |
| §14.3 每秒查询 DB | ✅ |
| §14.3 终态关闭流 | ✅ |
| §14.4 5 秒轮询兜底 + 4 种触发 | ✅ |
| §14.4 SSE 恢复后停轮询 | ✅ |
| §14.5 completed 后一次性拉 clips | ✅ |
| §14.6 测试 8 条 | ✅ |

## 第三阶段边界（明确不做）

- 真实上传链路 / ffmpeg.wasm 音频提取（Phase 4）
- 真实 Groq ASR（Phase 4）
- 真实 DeepSeek 评分/标题（Phase 5）
- 本地导出 MP4/SRT/TXT/JPG（Phase 6，ExportPanel 占位文案保留）
- 服务端字幕烧录 / ZIP（Phase 6）
- 真实失败重投递逻辑（Phase 4，本阶段重试按钮只跳项目页）

## 启动方式（不变）

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev
cd services/worker && uv run python -m clipwise_worker.main
```

## 本阶段修复的遗留问题

- `tests/api/regenerate.test.ts`：测试创建的 job 被后台 Worker 领取后调 mock_ai 删候选，造成跨测试数据竞态。修复：测试立即删除刚创建的 job。
- `e2e/project-interactions.spec.ts`：Phase 3 接通真实 PATCH 后，e2e 编辑会真写 DB 污染 demo-project。修复：afterEach 用 fetch PATCH 恢复 candidate-1 原始标题。
