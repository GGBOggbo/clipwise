# Clipwise 项目任务计划

## 目标

完成一个面向知识类直播回放的本地优先智能切片 MVP：用户选择本地 MP4 后，系统提取压缩音频，经 Groq ASR 和 DeepSeek 分析生成 TOP N 高光候选，用户预览、编辑并导出 MP4、SRT 和文案。

## 当前阶段

阶段 2：后端任务基础设施

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

- [ ] 确定后端运行方式和数据库方案
- [ ] 设计 projects、tasks、transcripts、clips 等核心数据结构
- [ ] 实现创建任务 API，立即返回 task ID
- [ ] 实现协程 task pipeline 主循环
- [ ] 每次领取创建时间最早的 pending 任务
- [ ] 串行执行任务并持久化状态、进度和错误
- [ ] 增加幂等、失败重试和进程重启恢复
- [ ] 编写单元测试和集成测试
- **状态：** in_progress

### 阶段 3：SSE 任务进度

- [ ] 实现任务详情与进度查询 API
- [ ] 实现 SSE 订阅接口
- [ ] 后端按任务进度变化推送状态
- [ ] 前端导航到任务页并订阅 SSE
- [ ] 增加断线重连与 5 秒轮询兜底
- [ ] 任务完成后一次性拉取 clips
- **状态：** pending

### 阶段 4：Groq ASR

- [ ] 浏览器本地提取 16kHz 单声道压缩音频
- [ ] 约 20 分钟一块进行音频分片
- [ ] 服务端安全调用 Groq `whisper-large-v3`
- [ ] 合并时间戳、重叠段和分块偏移
- [ ] 保存标准化 transcript
- [ ] 增加 ASR 失败重试和错误提示
- **状态：** pending

### 阶段 5：DeepSeek 高光发现

- [ ] 生成滑动窗口候选
- [ ] 使用 DeepSeek 批量评分
- [ ] 按分数排序并过滤时间重叠
- [ ] 选出 TOP N 候选
- [ ] 生成标题、摘要、金句、推荐理由和风险提示
- [ ] 将真实 clips 接入项目页
- **状态：** pending

### 阶段 6：本地切片与真实导出

- [ ] 接入 FFmpeg.wasm
- [ ] 浏览器按 startMs/endMs 切出 MP4
- [ ] 生成 SRT 和 TXT
- [ ] 实现当前片段导出
- [ ] 实现 TOP 5 顺序处理与 ZIP 打包
- [ ] 验证完整原视频不上传服务器
- **状态：** pending

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

## 需求真源

1. `references/直播回放智能切片工具_SPEC_v0.2.md`
2. `references/直播回放智能切片工具_前端设计稿合集_v0.2.md`
3. `references/clipwise-index-3.html`
4. `references/clipwise-project-5.html`
5. `docs/superpowers/specs/2026-06-22-clipwise-mvp-design.md`
6. `work/ai-highlight-clip-reference/`

## 备注

- 当前分支：`feature/phase1-frontend`
- 当前前端仍使用模拟 Provider 和演示候选数据。
- 下一次继续开发前，先读取 `task_plan.md`、`findings.md` 和 `progress.md`。
- 做后端重大技术选型前，先解决阶段 2 的五个关键问题。
