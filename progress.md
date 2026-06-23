# Clipwise 进度日志

## 会话：2026-06-22

### 里程碑 1：需求归档与项目初始化

- **状态：** complete
- 完成：
  - 保存产品 SPEC v0.2 和前端设计稿。
  - 归档上传页、项目页 HTML 参考。
  - 归档 `toki-plus/ai-highlight-clip` 作为算法参考。
  - 创建 pnpm monorepo、Next.js Web 应用和共享包。
- 关键提交：
  - `c36a2ce`
  - `e303e0b`
  - `fe6701c`

### 里程碑 2：前端 MVP

- **状态：** complete
- 完成：
  - 上传页、项目页和五阶段进度。
  - 候选卡片、排序、选中、详情和查看更多。
  - 本地视频重新关联和时间段预览。
  - 标题、摘要、金句和字幕编辑。
  - 自动保存状态和导出提醒。
  - 项目状态页和异常状态。
- 关键提交：
  - `f7e915f`
  - `07cd4da`
  - `9f6ca4c`

### 里程碑 3：前端验收与交互修正

- **状态：** complete
- 完成：
  - 增加无障碍测试和 Playwright E2E。
  - 完成 1024、1280、1440 三档桌面响应式验证。
  - 增加低于 900px 的桌面端提示。
  - 增加 MP4 拖拽选择。
  - 删除重复“选择回放”按钮，统一为一个文件入口。
  - 恢复上传页参考 HTML 的单行标题和三枚 SVG 图标。
- 关键提交：
  - `ff9d54a`
  - `11fc9f8`
  - `c256eae`
  - `f701319`

### 当前阶段：DeepSeek 高光发现

- **状态：** implementation_complete_e2e_pending
- 已完成：
  - DeepSeek Worker 配置、依赖和 env 示例。
  - strict tool schema、Pydantic 数据契约和契约测试。
  - transcript 滑动窗口、60 分阈值、80% 时间重叠去重和 quote 溯源校验。
  - DeepSeek strict tool 客户端、三次重试和错误分类。
  - 高光业务编排、真实字幕复制和候选详情校验。
  - 候选/字幕单事务替换；初次失败和重新生成失败状态分流。
  - Pipeline 删除生产 mock 候选路径，改为真实 DeepSeek 管线。
  - Web 集成测试移除固定 7 候选和假音频假设。
- 下一步：
  - 完成文档审计和全量自动验证。
  - 等用户提供 DeepSeek key 后做真实端到端验收。
  - Phase 4.1 长视频完整分片与 Phase 6 导出单独规划。

### 临时复查：项目页视觉与交互

- **状态：** complete
- 已检查：
  - 打开 demo token 和用户提供的长 token。
  - 确认两个 URL 当前都使用演示 fixture。
  - 确认浏览器控制台无错误和警告。
  - 测量确认页面高度实际铺满 viewport，排除主体高度 bug。
  - 发现候选选中边框与内部焦点框重复。
  - 发现左侧编辑区滚动条视觉过重。
  - 在用户 Chrome 的 1470×720 窗口复现：选择候选后 Tab 内容被播放器顶出视口。
  - 修改播放器和编辑内容的 Flex 分配。
  - Chrome 复验文案、字幕、导出三栏位置均为 top=473、bottom=720。
  - 将左侧父容器从 Flex 改为明确四行 Grid，消除 Chrome 与 Safari 高度计算差异。
  - 安装 Playwright WebKit，并通过同一条 1470×720 布局回归测试。
- 验证：
  - 1470×720 Chrome：文案、字幕、导出内容区位置正确。
  - Playwright Chromium 与 WebKit 布局回归测试均通过。
  - 完整跨浏览器 E2E：Chromium 4 条 + WebKit 4 条，共 8 条通过。
  - 前端相关 Vitest：14 个测试文件、33 条测试通过。
  - lint 与生产构建通过。
  - 全量 Vitest 仍有 2 条后端测试失败：候选 PATCH 对 demo fixture 返回 404；需要 Worker 的集成测试未达到 succeeded。两者不属于本次布局改动。

## 最新测试结果

| 测试 | 结果 | 状态 |
|------|------|------|
| Worker Phase 5 局部/全量测试 | 实现过程中已跑到 60 条通过 | PASS |
| Web 非真实集成 smoke | `create-to-ready`、`sse-flow` 通过 | PASS |
| 最终 Worker 全量测试 | 60 条通过 | PASS |
| Web 单测 | 35 个文件、91 条测试通过 | PASS |
| Web 非真实集成 smoke | 2 个文件、2 条测试通过 | PASS |
| E2E | Chromium/WebKit 共 8 条通过 | PASS |
| lint / build / diff / migration drift | lint、带 DATABASE_URL 的 build、diff、db:generate 均通过 | PASS |

## 错误日志

| 时间 | 错误 | 尝试次数 | 解决方案 |
|------|------|---------|---------|
| 2026-06-22 | 原 `.od` HTML 路径不存在 | 1 | 使用 `references/` 中归档副本 |
| 2026-06-22 | 上传页错误使用 01/02/03 | 1 | 恢复原始 SVG 并增加测试 |
| 2026-06-22 | 上传页主标题换行 | 1 | 恢复 nowrap 并增加 E2E |
| 2026-06-22 | 文件选择入口重复 | 1 | 合并拖拽、点击和键盘入口 |
| 2026-06-22 | 本机没有 FFmpeg CLI | 1 | 下载 2.7MB 测试 MP4 到 outputs |
| 2026-06-23 | `uv sync --frozen` 没有安装 pytest | 1 | 改用 `uv sync --frozen --extra dev` |
| 2026-06-23 | 本机代理环境变量影响 Python SDK/httpx | 1 | Worker 测试命令显式 unset proxy |
| 2026-06-23 | 旧集成测试依赖假音频和固定 7 候选 | 1 | 拆成 Web/API/SSE smoke、真实 ASR 和可选真实 DeepSeek E2E |
| 2026-06-23 | E2E 布局测试绑定可变 demo 标题，autosave 后找不到旧标题 | 1 | 改为按第一张候选卡稳定选择，并等待 autosave 完成 |
| 2026-06-23 | `pnpm build` 在未设置 `DATABASE_URL` 的 shell 失败 | 1 | 用本地开发 `DATABASE_URL` 执行 build，并在验收记录中标明该约束 |
| 2026-06-23 | Groq 直接接收 96.8MB 原视频返回 413 | 1 | 用 macOS `avconvert` 抽取前 120 秒 m4a 样本做真实验收；长视频自动分片留给 Phase 4.1 |
| 2026-06-23 | DeepSeek strict tool 对 `$ref/$defs` 嵌套 schema 约束不足 | 1 | 生成工具 schema 时内联 `$ref/$defs`，再用 Pydantic 和业务校验兜底 |

## 工作区状态

- 分支：`codex/phase5-deepseek`
- worktree：`.worktrees/phase5-deepseek`
- 最新代码提交：`c8f2326 test: remove fixed mock candidate assumptions`
- 未跟踪文件：`outputs/clipwise-test-video.mp4`
- 开发服务器：`http://localhost:3000`
- 当前页面：未固定；Phase 5 主要在 Worker 和集成测试层完成。

## 五问重启检查

| 问题 | 答案 |
|------|------|
| 我在哪里？ | `task_plan.md` 阶段 5：DeepSeek 高光发现收尾 |
| 我要去哪里？ | 自动验证 → 真实 DeepSeek E2E → Phase 4.1 长视频完整分片 → Phase 6 真实导出 |
| 目标是什么？ | 完成长直播自动发现高光、编辑和本地导出的 Clipwise MVP |
| 我学到了什么？ | 见 `findings.md` |
| 我做了什么？ | 见本日志及 Git 提交历史 |

---

*每完成一个后端阶段或遇到新错误时更新本文件。*
