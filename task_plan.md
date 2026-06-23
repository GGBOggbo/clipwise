# Clipwise 项目任务计划

## 目标

完成一个面向知识类直播回放的本地优先智能切片 MVP：用户选择本地 MP4 后，系统提取压缩音频，经 Groq ASR 和 DeepSeek 分析生成 TOP N 高光候选，用户预览、编辑并导出 MP4、SRT 和文案。

## 当前阶段

阶段 5.1：剪辑师素材召回规格化与实施准备

## 各阶段

### 阶段 1：前端 MVP

- [x] 建立 Next.js + TypeScript + pnpm 项目
- [x] 完成上传页与项目工作台
- [x] 完成候选列表、排序、选中和详情交互
- [x] 完成本地视频关联与候选时间段预览
- [x] 完成标题、摘要、金句和字幕编辑
- [x] 完成自动保存与导出状态界面
- [x] 完成拖拽选择 MP4
- [x] 按原始 HTML 恢复上传页单行标题和三枚 SVG 图标
- [x] 完成响应式、无障碍、组件测试和 E2E 验收
- **状态：** complete

### 阶段 2：数据库、任务 API 与串行异步调度

- [x] 确定后端运行方式和数据库方案
- [x] 设计 projects、jobs、transcript、clips 等核心数据结构
- [x] 实现创建项目 / 任务 API，快速返回项目和任务状态
- [x] 实现 Python Worker 串行任务主循环
- [x] 每次领取创建时间最早的 pending 任务
- [x] 串行执行任务并持久化状态、进度和错误
- [x] 增加任务失败状态和进程重启后的 pending/running 处理边界
- [x] 编写单元测试和集成测试
- **状态：** complete

### 阶段 3：SSE 任务进度

- [x] 实现任务详情与进度查询 API
- [x] 实现 SSE 订阅接口
- [x] 后端按任务进度变化推送状态
- [x] 前端导航到任务页并订阅 SSE
- [x] 增加断线重连与轮询兜底
- [x] 任务完成后一次性拉取 clips
- **状态：** complete

### 阶段 4：Groq ASR

- [x] 浏览器本地提取压缩音频
- [x] 服务端安全调用 Groq `whisper-large-v3`
- [x] 保存标准化 transcript
- [x] 增加 ASR 失败错误提示
- [x] Phase 4.1：长视频完整时长分片、合并偏移和重叠段处理
- **状态：** complete

### 阶段 5：DeepSeek 高光发现

- [x] 生成 45–150 秒滑动窗口候选，目标 90 秒、步长 45 秒
- [x] 使用 DeepSeek Beta strict tool calling 批量评分
- [x] 按 60 分阈值、分数排序和 80% 时间重叠去重
- [x] 选出最多 10 个真实候选
- [x] 生成标题、摘要、原文金句、推荐理由和风险提示
- [x] 将真实 clips 持久化并接入项目页读取路径
- [x] 删除 Worker 生产 mock candidate 路径
- [x] 使用用户提供的真实 DeepSeek key 完成端到端人工验收
- [x] Web 页面真实上传 8 分钟视频并生成真实候选
- [ ] Phase 5.1：按剪辑师工作流重新校准召回目标，从 TOP 10 升级到约 30 条片段建议，并持久化淘汰原因/评分过程用于解释
  - [x] 编写 Phase 5.1 规格文档，明确「剪辑师素材召回」不是「成片爆款判断」
  - [x] 编写 Phase 5.1 实施计划，拆分数据库、Worker、DeepSeek、Web、验收任务
  - [ ] 将评分从通用内容质量改为 4+1：信息密度、钩子强度、独立可懂、可剪成片、否决项
  - [ ] 模型输出离散推荐档位：strong/recommended/backup/reject，`finalScore` 仅作排序辅助
  - [ ] 新增剪辑师核心字段：`topicLabel`、`editingNote`、`boundaryReason`、`needsSetup`
  - [ ] 建立窗口级评分/淘汰原因持久化，支持解释「为什么留下/淘汰」
  - [ ] 设计主题分散机制，避免 30 条素材集中在同一话题
  - [ ] 设计剪辑师人工标注留出集，用于校准阈值、否决项和 prompt
- **状态：** complete

### 阶段 6：本地切片与真实导出

- [x] 接入 FFmpeg.wasm（复用 Phase 4 getFFmpeg 单例）
- [x] 浏览器按 startMs/endMs 切出 MP4（`-c copy` 流拷贝）
- [x] 生成 SRT 和 TXT
- [x] 实现当前片段导出（MP4 + SRT + TXT 分别下载）
- [x] 实现 TOP 5 顺序处理与 ZIP 打包（fflate）
- [ ] Phase 6.1：支持约 30 个 1–3 分钟 MP4 批量导出到本地，服务剪辑师二次筛选
- [x] 验证完整原视频不上传服务器
- **状态：** complete_with_known_gap（快速导出完成；带字幕成片导出未做）

### 阶段 7：并发能力与部署

- [ ] 将串行 worker 演进为有限并发 worker
- [ ] 单进程使用 asyncio.Lock 防止重复领取
- [ ] 为 MySQL/Redis 锁或消息队列保留演进边界
- [ ] 增加并发、超时、恢复和压力测试
- [ ] 配置生产环境密钥、日志、监控和部署
- **状态：** pending

## 关键问题

1. 后端使用 Next.js 内置 API，还是独立 Python/FastAPI 服务？
2. 本地开发首版使用 SQLite/Postgres 中哪一种，生产数据库部署在哪里？
3. 音频分片由浏览器直接上传对象存储，还是经过应用服务中转？
4. 任务处理进程和 Web 服务是否首版同进程运行？
5. Groq 与 DeepSeek 的 API 密钥何时配置？

## 已做决策

| 决策 | 理由 |
|------|------|
| 产品名使用 Clipwise | 已用于现有前端、页面标题和视觉参考 |
| 桌面端优先，低于 900px 阻止视频处理 | FFmpeg.wasm 和长视频处理不适合当前移动端目标 |
| 原始完整视频不上传 | 核心隐私与架构边界 |
| ASR 使用 Groq | 用户指定，默认模型 `whisper-large-v3` |
| 高光评分与标题使用 DeepSeek | 用户指定 |
| DeepSeek 输出使用 strict tool calling + Pydantic + 业务校验 | 只靠提示词约束格式不稳；生产路径需要可解析、可验证、可失败 |
| 高光算法参考 `toki-plus/ai-highlight-clip` | 参考滑动窗口、LLM 评分、排序、去重和 TOP N 管线 |
| 第一版任务调度先串行 | 先保证正确性、状态恢复和可观测性，再演进并发 |
| 进度使用 SSE，保留 5 秒轮询兜底 | 兼顾实时体验与弱网/防火墙断连恢复 |
| 前端切片最终使用 FFmpeg.wasm | 服务端保持重 IO、轻 CPU，原视频留在本地 |
| 上传页拖拽区同时承担点击选择 | 避免重复入口 |
| 上传页样式以本地参考 HTML 为准 | 用户要求忠实还原原稿 |

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 原始 `.od` HTML 路径已不存在 | 1 | 使用已归档的 `references/clipwise-index-3.html` 和 `references/clipwise-project-5.html` |
| 上传页误将原始 SVG 图标改成 01/02/03 | 1 | 对照归档 HTML 恢复三枚 SVG 图标，并增加回归测试 |
| 上传页标题自动换行 | 1 | 恢复原稿 `white-space: nowrap` 和 40px 字号，并增加 E2E 样式测试 |
| 拖拽入口与“选择回放”按钮重复 | 1 | 合并为单一拖拽/点击/键盘入口 |
| 开发服务器热更新曾出现 effect 依赖告警 | 1 | 重新检查组件状态并通过全量构建、E2E 和浏览器控制台验证 |
| Worker 测试环境未安装 pytest | 1 | 使用 `uv sync --frozen --extra dev` 安装 dev extra |
| 本机代理变量影响 Python SDK/httpx 初始化 | 1 | Worker 测试命令中显式 unset proxy 环境变量 |
| 旧 Web 集成测试上传 3 字节假音频并假设固定 7 候选 | 1 | 分层为 Web/API/SSE 测试、真实 ASR 测试、可选真实 DeepSeek E2E |
| DeepSeek strict tool 对 `$ref/$defs` 嵌套 schema 约束不足 | 1 | 生成工具 schema 时内联引用，继续用 Pydantic 和业务校验兜底 |
| DeepSeek 语义去重偶发返回不一致 duplicate 决策 | 1 | 业务层对指向未保留候选/更低分候选的重复关系做本地保留纠偏 |
| Chrome 项目页视频显示不完整 | 1 | 将 video 绝对定位填满播放器容器，由 `object-fit: contain` 在框内缩放 |

## 需求真源

1. `references/直播回放智能切片工具_SPEC_v0.2.md`
2. `references/直播回放智能切片工具_前端设计稿合集_v0.2.md`
3. `references/clipwise-index-3.html`
4. `references/clipwise-project-5.html`
5. `docs/superpowers/specs/2026-06-22-clipwise-mvp-design.md`
6. `work/ai-highlight-clip-reference/`

## 备注

- 当前实现分支：`codex/phase5-deepseek`，隔离 worktree 位于 `.worktrees/phase5-deepseek`。
- `packages/shared/src/fixtures.ts` 和测试/seed 仍可保留演示 fixture；Worker 生产候选路径不得导入 fixture 或 mock。
- 下一次继续开发前，先读取 `task_plan.md`、`findings.md`、`progress.md` 和 `docs/phase-5-verification.md`。
- Phase 6 前不要顺手实现导出；Phase 4.1 长视频完整分片也应单独规划。
- 当前 Web/Worker 仍在本机运行，方便用户刷新 `http://localhost:3000` 查看项目 `K2NgL4Gl...` 的 3 条真实候选。
- 压缩上下文后继续时，优先不要直接改 DeepSeek prompt；先写 Phase 5.1 规格/计划，再按 TDD 改 strict 数据契约、DeepSeek schema、pipeline、持久化和前端展示。
- Phase 5.1 规格已写入 `docs/superpowers/specs/2026-06-23-clipwise-phase5-1-editor-recall-design.md`；实施前需要基于该规格写详细计划。
- Phase 5.1 实施计划已写入 `docs/superpowers/plans/2026-06-23-clipwise-phase5-1-editor-recall.md`；执行前需确保播放器 bugfix 两个未提交文件不混入 Phase 5.1 提交。
