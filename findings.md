# Clipwise 发现与决策

## 产品需求

- 面向知识类主播和内容创作者，从 1–2 小时直播回放中自动发现值得二次发布的知识片段。
- 系统默认生成多个候选，按推荐度展示 TOP 5，并允许查看更多。
- 候选片段不是最终成片；“选中”“预览中”“已预览”“已确认”“已导出”必须分开。
- 用户可以修改标题、摘要、原文金句和字幕。
- 输出目标为 MP4、SRT 和 TXT；完整原视频不得上传服务器。

## 当前实现

- Monorepo 使用 pnpm。
- Web 应用位于 `apps/web`，技术栈为 Next.js 16、React 19、TypeScript、CSS Modules。
- 共享领域模型和 fixtures 位于 `packages/shared`。
- 上传页支持：
  - 点击或拖拽选择 MP4
  - MP4 与 2GB 大小校验
  - 文件替换
  - 开始分析后进入演示项目
- 项目页支持：
  - 五阶段进度展示
  - 候选 TOP 5 / 查看更多
  - 推荐排序 / 时间排序
  - 候选选中与预览状态分离
  - 本地视频重新关联
  - 按候选时间范围播放
  - 标题、摘要、金句和字幕编辑
  - 防抖自动保存状态
  - 未预览导出提醒
  - 模拟导出阶段
- 小于 900px 显示桌面端提示，不进入视频处理。

## 前端视觉发现

- 上传页真实参考文件：`references/clipwise-index-3.html`。
- 项目页真实参考文件：`references/clipwise-project-5.html`。
- 上传页主标题原稿为 40px，并使用 `white-space: nowrap`。
- “你会得到”三张卡原稿使用三枚 SVG 图标：
  - 圆环加号：AI 推荐切片
  - 文档：标题 / 摘要 / 金句
  - 下载：MP4 / SRT / 文案
- 不应使用 `01 / 02 / 03` 数字编号。
- 拖拽区是新增能力，但必须维持原稿克制、明亮、工具型的视觉方向。
- 2026-06-22 项目页浏览器复查：
  - `/project/demo-project` 与 `/project/Xupdz85zF6MQPSNKKit1huDloiFxAJuY` 当前渲染完全相同。
  - 任意 token 都显示“演示项目”和同一组 fixture，token 尚未驱动项目数据或状态。
  - 右侧候选卡片信息密度偏高，需要继续与 `references/clipwise-project-5.html` 对照。
  - 实际测量显示项目 shell 与 viewport 高度一致；截图中的底部空白主要来自浏览器截图缩放表现，不是页面真实高度缺失。
  - 选中候选后，卡片外层蓝色选中边框与内部按钮焦点框同时出现，形成重复“框中框”。
  - 文案编辑区原生滚动条在内容较长时较明显，可作为后续视觉微调项。
  - Chrome 真实窗口确认核心错位根因：`LocalVideoPlayer` 使用 `height: 100%`，选择候选后播放器从 317px 膨胀到约 514px，将 Tab 内容区起点推到 y≈707，而窗口高度仅 720px。
  - 修正为播放器和 Tab 内容区共同使用 `flex: 1 1 0` 后，720px 高度下播放器为 280px，文案/字幕/导出内容区均从 y=473 开始并延伸到窗口底部。
  - 进一步跨浏览器修复：Flex 仍会受 Chromium/WebKit intrinsic size 差异影响，因此左侧改为四行 CSS Grid：`播放器 / 片段信息 / Tab / 内容区`。
  - 1470×720 回归测试已分别在 Chromium 和 WebKit 通过，Safari 不再依赖 Flex 高度协商。

## 后端架构发现

- 任务提交必须快速返回 task ID，不等待 ASR 或 LLM 完成。
- 串行版流程：
  1. 写入 pending task。
  2. 立即响应前端。
  3. 后台循环领取创建时间最早的 pending task。
  4. 一次处理一个任务。
  5. 持久化每个阶段的状态、进度和错误。
- SSE 负责实时进度，推送字段至少包括：
  - task ID
  - progress
  - 状态文字
- SSE 可每秒或进度变化时推送；任务长、用户多时可把 DB 查询间隔调整为约 3 秒。
- 前端保留 5 秒轮询兜底，应对 Wi-Fi 切换、防火墙关闭长连接和移动弱网。
- 任务完成后一次性拉取 clips，不需要持续轮询候选结果。
- 并行指不同任务之间并行，与是否打开多个浏览器窗口无关；不同用户或同一用户多次提交都可能形成并行任务。
- 首版先串行，稳定后演进有限并发；单进程可用 asyncio.Lock，跨进程再考虑数据库锁、Redis 锁或消息队列。

## AI 管线发现

- ASR 服务：Groq。
- 默认 ASR 模型：`whisper-large-v3`。
- LLM：DeepSeek。
- DeepSeek Phase 5 使用 Beta strict tool calling，而不是只靠提示词要求 JSON。
- 结构化输出方案是通用工程模式：原生约束优先，随后解析、schema 校验、业务不变量校验，最后才执行副作用；失败要重试或显式失败，不静默补假数据。
- DeepSeek strict tool schema 约束：
  - base URL 使用 `https://api.deepseek.com/beta`。
  - function schema 设置 `strict: true`。
  - object 需要 `additionalProperties: false`。
  - object 的 properties 全部列入 required。
  - schema 中避免生成 DeepSeek strict 当前不支持的长度/数量约束。
- Worker 内部仍用 Pydantic 二次验证，禁止 extra field、非法枚举和类型漂移。
- 高光算法参考仓库已归档到 `work/ai-highlight-clip-reference/`。
- 候选生成管线：
  1. transcript 标准化
  2. 滑动窗口候选
  3. LLM 批量评分
  4. 按分数排序
  5. 时间重叠去重
  6. TOP N
  7. 标题、摘要、金句、推荐理由和风险提示生成
- Phase 5 实现后的候选约束：
  - 窗口目标 90 秒，允许 45–150 秒，步长 45 秒。
  - 只保留 60 分及以上候选。
  - 时间重叠比例定义为 `overlap / min(duration_a, duration_b)`，超过 0.8 视为重复。
  - 最终最多写入 10 条候选，rank 连续。
  - subtitle、start/end 和 quote 都以 `transcript_segments` 为真源。
  - 初次生成失败时项目 failed 且不写候选；重新生成失败时保留旧候选并恢复 ready。
- 完整原视频留在浏览器；浏览器通过 FFmpeg.wasm 抽取压缩音频。
- 音频建议 16kHz 单声道、约 20 分钟一块，块之间保留少量重叠。

## 测试和验收

- 最新已验证：
  - Phase 5 Worker 单元/集成测试：实现过程中已通过 60 条 Worker 测试。
  - Phase 5 Web 非真实集成 smoke：`create-to-ready`、`sse-flow` 已通过。
  - 最终全量自动验收记录见 `docs/phase-5-verification.md`。
- 已验证桌面尺寸：1024×768、1280×720、1440×900。
- 已验证上传页标题单行、原始三枚 SVG 图标、拖拽选择和格式错误提示。
- 已验证项目页候选、编辑、导出提醒和查看更多流程。

## Git 状态

- 当前实现分支：`codex/phase5-deepseek`
- 基线分支：`feature/phase4-asr`
- 关键提交：
  - `c36a2ce` 初始化工作区
  - `fe6701c` 领域模型与 fixtures
  - `f7e915f` 上传页
  - `07cd4da` 项目工作台和候选
  - `9f6ca4c` 本地预览和编辑
  - `ff9d54a` 第一阶段验收
  - `11fc9f8` 拖拽选择
  - `c256eae` 合并文件选择入口
  - `f701319` 恢复上传页参考样式
  - `2753a27` 增加 DeepSeek Worker 配置
  - `a327c6b` 增加 strict 高光数据契约
  - `8b905a5` 增加确定性窗口筛选
  - `e8acb04` 增加 strict DeepSeek 客户端
  - `3e9589c` 增加真实高光生成业务编排
  - `530aab4` 增加候选原子持久化
  - `d6e811d` 用 DeepSeek 管线替换 Worker mock 候选
  - `c8f2326` 移除固定 mock 候选测试假设

## 未完成边界

- 真实 DeepSeek E2E 仍等待用户提供新的 API key 与可验收项目 token。
- Phase 4.1：长视频完整时长分片、偏移合并和重叠处理仍需单独规划。
- Phase 6：FFmpeg.wasm 本地切片、SRT/TXT/ZIP 导出尚未实现。
- 前端 seed/tests/fixtures 可以保留演示数据；Worker 生产候选路径不得回退 mock。
- `outputs/clipwise-test-video.mp4` 是本地测试素材，目前未纳入 Git。

## 资源

- 产品规格：`references/直播回放智能切片工具_SPEC_v0.2.md`
- 前端规格：`references/直播回放智能切片工具_前端设计稿合集_v0.2.md`
- MVP 设计：`docs/superpowers/specs/2026-06-22-clipwise-mvp-design.md`
- 第一阶段验收：`docs/phase-1-verification.md`
- 第五阶段验收：`docs/phase-5-verification.md`
- 前端实施计划：`docs/superpowers/plans/2026-06-22-clipwise-phase1-frontend.md`
- 拖拽设计：`docs/superpowers/specs/2026-06-22-upload-drag-drop-design.md`
- 拖拽计划：`docs/superpowers/plans/2026-06-22-upload-drag-drop.md`

---

*任何新的外部资料、浏览器发现和技术调研结果优先写入本文件。*
