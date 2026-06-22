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
- 高光算法参考仓库已归档到 `work/ai-highlight-clip-reference/`。
- 候选生成管线：
  1. transcript 标准化
  2. 滑动窗口候选
  3. LLM 批量评分
  4. 按分数排序
  5. 时间重叠去重
  6. TOP N
  7. 标题、摘要、金句、推荐理由和风险提示生成
- 完整原视频留在浏览器；浏览器通过 FFmpeg.wasm 抽取压缩音频。
- 音频建议 16kHz 单声道、约 20 分钟一块，块之间保留少量重叠。

## 测试和验收

- 最新已验证：
  - Vitest：15 个测试文件、36 个测试通过
  - Playwright：3 个 E2E 测试通过
  - ESLint：通过
  - Next.js 生产构建：通过
- 已验证桌面尺寸：1024×768、1280×720、1440×900。
- 已验证上传页标题单行、原始三枚 SVG 图标、拖拽选择和格式错误提示。
- 已验证项目页候选、编辑、导出提醒和查看更多流程。

## Git 状态

- 当前分支：`feature/phase1-frontend`
- 最新提交：`f701319 fix: restore upload page reference styling`
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

## 未完成边界

- 当前没有真实数据库。
- 当前没有任务创建 API、worker 或 SSE。
- 当前没有 Groq 和 DeepSeek API 调用。
- 当前没有 FFmpeg.wasm 音频提取和真实 MP4 导出。
- 当前候选、保存和导出均为前端模拟。
- `outputs/clipwise-test-video.mp4` 是本地测试素材，目前未纳入 Git。

## 资源

- 产品规格：`references/直播回放智能切片工具_SPEC_v0.2.md`
- 前端规格：`references/直播回放智能切片工具_前端设计稿合集_v0.2.md`
- MVP 设计：`docs/superpowers/specs/2026-06-22-clipwise-mvp-design.md`
- 第一阶段验收：`docs/phase-1-verification.md`
- 前端实施计划：`docs/superpowers/plans/2026-06-22-clipwise-phase1-frontend.md`
- 拖拽设计：`docs/superpowers/specs/2026-06-22-upload-drag-drop-design.md`
- 拖拽计划：`docs/superpowers/plans/2026-06-22-upload-drag-drop.md`

---

*任何新的外部资料、浏览器发现和技术调研结果优先写入本文件。*
