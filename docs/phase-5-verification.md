# Clipwise Phase 5 验收记录

日期：2026-06-23

## 验收范围

Phase 5 将真实 `transcript_segments` 通过 DeepSeek strict tool calling 转换为 1–10 条可溯源高光候选。生产 Worker 不再包含固定 mock candidate 生成路径，也不在失败时静默回退到假候选。

## 自动测试

| 项目 | 命令 | 结果 |
|---|---|---|
| Worker 全量测试 | `cd services/worker && env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy uv run pytest -q` | PASS：60 passed |
| Web 单测 | `DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' pnpm --filter @clipwise/web exec vitest run --exclude 'tests/integration/**'` | PASS：35 files / 91 tests |
| Web 非真实集成 smoke | `DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' pnpm --filter @clipwise/web exec vitest run tests/integration/create-to-ready.test.ts tests/integration/sse-flow.test.ts` | PASS：2 files / 2 tests |
| E2E | `DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' pnpm test:e2e` | PASS：8 Playwright tests |
| Lint | `pnpm lint` | PASS |
| Build | `DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' pnpm build` | PASS；保留既有 Next/Turbopack worktree root 与 NFT tracing warning |
| Diff whitespace | `git diff --check` | PASS |
| DB migration drift | `pnpm db:generate && git status --short apps/web/db/migrations` | PASS：No schema changes |

## Strict schema 契约

- DeepSeek 调用使用 `https://api.deepseek.com/beta`。
- 工具 schema 使用 `strict: true`。
- 每个 object 都设置 `additionalProperties: false`。
- 每个 object 的所有 properties 都列入 `required`。
- 工具 schema 会内联 `$ref/$defs`，避免 DeepSeek strict mode 对嵌套引用约束不充分。
- Pydantic 模型使用 `extra="forbid"` 和 strict 类型校验。
- 模型响应通过三层校验：DeepSeek strict schema → Pydantic → 业务不变量。

## 无 mock 审计

生产路径审计命令：

```bash
rg -n "generate_mock_candidates|MOCK_CANDIDATES|mock_ai" \
  services/worker/clipwise_worker apps/web/app apps/web/lib
```

结果：2026-06-23 运行后 0 匹配；`rg` exit 1 且无输出，表示生产路径没有命中 `generate_mock_candidates`、`MOCK_CANDIDATES` 或 `mock_ai`。

允许保留 fixture 的位置：

- `packages/shared/src/fixtures.ts`
- `apps/web/db/seed.ts`
- `apps/web/tests/`

## 真实 DeepSeek 端到端验收

状态：已完成。使用用户提供的 DeepSeek key；Groq key 来自本地 ignored env。原始 96.8MB 视频直接上传触发 Groq `413 Payload Too Large`，因此用 macOS `avconvert` 从 `/Users/chk/Downloads/飞书20260623-131141.mp4` 抽取前 120 秒真实音频样本进行验收。

| 字段 | 结果 |
|---|---|
| 项目 token 前 8 位 | `WE6Czyof` |
| transcript segment 数 | 81 |
| 候选数量 | 1 |
| job 状态 | succeeded |
| project 状态 | ready |
| 自动溯源检查 | passed |
| 候选分数 | 82 |
| 候选时长 | 90 秒 |

真实验收中的修复：

- 初次 DeepSeek strict tool 连通性检查暴露嵌套 `$ref/$defs` schema 没有被充分约束，模型返回了 schema 外字段/非法枚举。
- 修复为内联 schema 后，DeepSeek strict 返回通过 Pydantic 校验。
- 最终真实候选生成成功，写入 1 条候选，字幕和 quote 均来自 transcript。

## 人工抽查

| 候选 | 标题与内容一致 | 摘要无额外事实 | quote 可在字幕定位 | 边界不截断明显半句话 | 无明显语义重复 |
|---|---|---|---|---|---|
| 1 | 通过 | 通过 | 通过 | 通过 | 通过 |
| 2 | 不适用：本样本仅生成 1 条候选 | 不适用 | 不适用 | 不适用 | 不适用 |
| 3 | 不适用：本样本仅生成 1 条候选 | 不适用 | 不适用 | 不适用 | 不适用 |

## 尚未完成边界

- Phase 4.1：长视频完整时长分片与合并仍待单独加强；当前不在 Phase 5 中顺手修。
- Phase 6：本地 FFmpeg.wasm 切片、SRT/TXT/ZIP 导出尚未实现。
- 普通 `pnpm build` 在没有 `DATABASE_URL` 的 shell 中会失败；这是当前 API route 在 build 收集阶段加载 DB client 的既有约束。本次验收使用本地开发数据库 URL 执行 build。
- Phase 4.1 仍需实现生产级长视频分片；本次真实验收用 `avconvert --duration 120` 手动抽样规避 Groq 单请求大小限制。
- ASR 原文存在少量识别错误，例如专有词/英文技术词转写不准；候选生成严格基于该 transcript，没有越权修正文稿。
