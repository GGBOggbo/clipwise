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

状态：等待用户提供新的 DeepSeek API key 和一个已有真实 transcript 的项目 token。

记录模板：

| 字段 | 结果 |
|---|---|
| 项目 token 前 8 位 | 待填写 |
| transcript segment 数 | 待填写 |
| 候选数量 | 待填写 |
| job 状态 | 待填写 |
| project 状态 | 待填写 |
| 自动溯源检查 | 待填写 |

## 人工抽查

| 候选 | 标题与内容一致 | 摘要无额外事实 | quote 可在字幕定位 | 边界不截断明显半句话 | 无明显语义重复 |
|---|---|---|---|---|---|
| 1 | 待查 | 待查 | 待查 | 待查 | 待查 |
| 2 | 待查 | 待查 | 待查 | 待查 | 待查 |
| 3 | 待查 | 待查 | 待查 | 待查 | 待查 |

## 尚未完成边界

- Phase 4.1：长视频完整时长分片与合并仍待单独加强；当前不在 Phase 5 中顺手修。
- Phase 6：本地 FFmpeg.wasm 切片、SRT/TXT/ZIP 导出尚未实现。
- 真 DeepSeek E2E 需要外部 API key，不能用假 key 或 mock 结果替代。
- 普通 `pnpm build` 在没有 `DATABASE_URL` 的 shell 中会失败；这是当前 API route 在 build 收集阶段加载 DB client 的既有约束。本次验收使用本地开发数据库 URL 执行 build。
