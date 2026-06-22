# Clipwise 第二阶段验收记录

验收日期：2026-06-22

## 自动验证

| 检查项 | 结果 |
|---|---|
| `pnpm test`（vitest 单元测试，排除集成） | ✅ 27 文件 / 66 测试通过 |
| `pnpm test:e2e`（Playwright） | ✅ 3 测试通过 |
| Python Worker `pytest` | ✅ 12 测试通过 |
| `pnpm lint`（ESLint） | ✅ 0 errors / 0 warnings |
| `pnpm build`（Next.js 生产构建） | ✅ 9 API 路由 + 项目页编译通过 |
| 集成测试 `tests/integration/create-to-ready.test.ts` | ✅ 完整链路通过（需 live 服务） |

## 链路验证（design §17.3）

端到端集成测试验证了从创建项目到候选就绪的完整链路：

1. ✅ `POST /api/projects` 创建项目，返回 `projectToken`
2. ✅ `POST /api/projects/:token/audio` 上传压缩音频，创建 `generate_candidates` job，返回 `{ projectToken, taskId }`
3. ✅ Python Worker 通过 `SELECT FOR UPDATE SKIP LOCKED` 领取任务
4. ✅ Worker 串行执行，按阶段持久化进度（"正在识别语音" → "正在分析内容" → "正在生成候选片段"）
5. ✅ Worker 写入 7 个模拟候选，项目状态变为 `ready`
6. ✅ `GET /api/tasks/:taskId` 查询任务状态返回 `TaskProgressEvent`
7. ✅ `GET /api/projects/:token/clips` 拉取 7 候选
8. ✅ `ApiProjectProvider.getProject()` 读到 `status: "ready"` 的完整项目

## 数据库（design §12.3）

7 张表全部建立并通过 Drizzle 迁移：
- `projects`、`project_files`、`transcript_segments`
- `clip_candidates`、`subtitle_lines`
- `jobs`、`export_artifacts`

## API 覆盖（design §13）

| Endpoint | 状态 |
|---|---|
| POST /api/projects | ✅ |
| POST /api/projects/:token/audio | ✅ |
| GET /api/projects/:token | ✅ |
| GET /api/projects/:token/clips | ✅ |
| POST /api/projects/:token/reconnect | ✅ |
| PATCH /api/projects/:token/candidates/:id | ✅ |
| POST /api/projects/:token/regenerate | ✅ |
| POST /api/projects/:token/subtitled-export | ⬜ Phase 6 |
| GET /api/tasks/:taskId | ✅ |
| GET /api/tasks/:taskId/events（SSE） | ⬜ 501 占位，Phase 3 实现 |

## 第二阶段边界（明确不做）

- ASR/评分/候选生成使用模拟数据，未调用真实 Groq/DeepSeek（Phase 4/5）
- SSE 任务进度接口为 501 占位（Phase 3）
- FFmpeg.wasm 浏览器音频提取（Phase 4）
- 真实文件导出 / 字幕烧录 / ZIP（Phase 6）
- 上传页跳转逻辑保持现状（demo-project），音频上传流程留给 Phase 4
- 多并发 Worker、Redis 锁、消息队列（Phase 7）

## 启动方式

```bash
# 1. 起数据库
pnpm db:up
pnpm db:migrate
pnpm db:seed

# 2. 起 Web + API
pnpm dev

# 3. 起 Worker（另一个终端）
cd services/worker
uv run python -m clipwise_worker.main
```
