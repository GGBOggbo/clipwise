# Clipwise MVP 设计文档

## 1. 产品定义

Clipwise 是一款面向知识类直播回放的本地优先智能切片工具。

它的核心任务不只是剪视频，而是从长直播中发现值得二次发布的知识单元，让创作者不必完整看完回放，也能快速确认内容并导出可发布素材。

第一版用于本地内测，目标用户是使用桌面端 Chrome 或 Edge 的知识创作者。暂不服务专业剪辑团队、娱乐直播、多账号团队和自动发布工作流。

## 2. 需求真源

产品和开发决策以以下文件为准：

1. `outputs/直播回放智能切片工具_SPEC_v0.2.md`
2. `outputs/直播回放智能切片工具_前端设计稿合集_v0.2.md`
3. 上传页视觉参考：
   `/Users/chk/.claude/skills/open-design/.od/projects/ffc60b4d-2b71-4d9f-94d8-605964a03522/clipwise-index-3.html`
4. 项目页视觉参考：
   `/Users/chk/.claude/skills/open-design/.od/projects/ffc60b4d-2b71-4d9f-94d8-605964a03522/clipwise-project-5.html`
5. 高光评分算法参考：
   `https://github.com/toki-plus/ai-highlight-clip`

两份 HTML 只作为视觉与交互参考，不直接作为生产代码。保留轻量工具感、左右分栏和主要信息结构，重新实现状态模型、组件边界、无障碍能力、页面链接和真实视频行为。

## 3. MVP 成功闭环

本地内测版必须跑通：

```text
选择本地 MP4
→ 提取并上传压缩音频
→ 音频转写
→ 发现并排序高光候选
→ 真实预览候选片段
→ 编辑文案和字幕
→ 导出 MP4 + SRT + TXT
```

原始完整回放不得上传服务器。

核心验证目标保持不变：使用 10 个知识直播回放测试，至少 7 个视频能产生至少 1 个用户愿意导出的有效切片。

## 4. 产品状态定义

以下概念必须严格分开：

```text
候选
AI 推荐的、可能适合二次发布的时间段。

选中
当前正在编辑器中查看的候选。

预览中
原视频正在播放该候选时间范围。

已预览
用户已经播放候选时长的至少 80%。

已确认
用户认可该片段的内容和边界，可以导出。

已导出
已经生成真实输出文件。
```

点击候选卡片不等于已预览。未预览的候选仍可导出，但界面必须先展示非阻断式提醒。

## 5. 页面与视觉结构

### 5.1 上传页

路由：`/`

职责：

- 立即说明产品价值。
- 明确原始视频不会上传。
- 校验 MP4 格式、文件大小、视频时长和浏览器能力。
- 展示文件名、大小和时长。
- 分开“选择文件”和“开始分析”两个动作。
- 展示 FFmpeg 加载、音频提取、音频压缩和上传阶段。
- 支持从失败阶段重试，不要求用户重新开始。

保留现有克制、明亮、工具型的视觉方向，不做成营销官网。

### 5.2 项目页

路由：`/project/[token]`

布局：

```text
顶部：项目状态、保存状态、过期时间、新建项目
左侧：真实本地播放器、当前片段信息、文案/字幕/导出 Tab
右侧：候选排序、候选列表、更多候选、重新生成
```

桌面端继续采用约 65/35 的左右比例。在常见笔记本分辨率下，播放器和编辑区都必须保留足够高度。

候选卡片包含：

- 类型和推荐等级
- 开始时间、结束时间和时长
- 当前标题
- 摘要
- 原文金句
- “预览片段”按钮
- “查看详情”按钮

所有导出动作集中在左侧“导出”Tab，候选卡片不再重复放置全部导出按钮。

## 6. 前端状态模型

```ts
type ProjectStatus =
  | "waiting_for_video"
  | "extracting_audio"
  | "uploading_audio"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "failed"
  | "expired";

type VideoConnectionStatus =
  | "missing"
  | "checking"
  | "connected"
  | "mismatch"
  | "unsupported";

type PreviewStatus =
  | "not_previewed"
  | "previewing"
  | "previewed";

type SaveStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "failed";

type ExportStatus =
  | "idle"
  | "confirming"
  | "preparing"
  | "exporting"
  | "completed"
  | "failed";
```

项目页刷新后必须恢复服务端保存的项目状态。如果浏览器已经无法访问原视频，应显示“重新关联原视频”流程，而不是展示空播放器。

文案和字幕采用防抖自动保存，并明确展示“保存中、已保存、保存失败”。

## 7. 本地视频关联与预览

浏览器为用户选择的原视频创建对象 URL，并使用原生 `<video>` 元素播放。

预览行为：

1. 跳转到 `startMs`。
2. 完成跳转后再开始播放。
3. 播放到 `endMs` 时自动暂停。
4. 统计候选时间范围内的有效播放时长。
5. 累计播放达到候选时长的 80% 后标记为已预览。
6. 切换候选时立即停止上一片段。

用户回来继续处理时，通过以下信息校验重新选择的文件：

- 文件大小
- 视频时长
- 文件开头、中间和结尾的小块采样哈希

服务器只接收紧凑的文件指纹，不接收原始视频。

## 8. 音频提取与 Groq ASR

语音识别使用 Groq，默认模型通过环境变量配置，第一版使用：

```text
whisper-large-v3
```

浏览器处理流程：

```text
本地 MP4
→ FFmpeg.wasm
→ 16 kHz 单声道压缩音频
→ 上传音频分块
```

音频按约 20 分钟分块，必要时保留少量重叠。这样可以避开单文件限制，并支持单阶段重试。

Worker 请求分段或词级时间戳，为每块添加全局时间偏移，合并重叠内容，最终保存标准化的转写片段。

Groq 密钥只能存在于 Worker 的服务端环境中。

## 9. 高光发现与排序

候选排序管线参考 `toki-plus/ai-highlight-clip` 的真实实现：

```text
生成滑动窗口候选
→ LLM 批量评分
→ 按分数排序
→ 时间重叠去重
→ 选出 TOP N
→ 生成标题和候选信息
```

### 9.1 候选窗口

初始默认值：

```text
目标时长：90 秒
最短时长：45 秒
最长时长：150 秒
滑动步长：45 秒
```

窗口边界必须对齐完整的转写片段。这些参数在 MVP 中作为服务端配置，不暴露给普通用户。

### 9.2 DeepSeek 评分

DeepSeek 负责全部文本智能任务：

- 高光评分
- 推荐理由
- 片段分类
- 边界修正
- 标题生成
- 摘要生成
- 原文金句提取
- 风险提示

模型名通过环境变量配置，第一版目标模型为：

```text
deepseek-v4-flash
```

评分使用非思考模式和 JSON Output。提示词必须明确要求 JSON，并给出完整输出示例。

每个候选由模型直接给出一个 0–100 的整数 `finalScore`，沿用参考项目的综合评分方式，不在应用代码中计算一套固定加权公式。

知识直播评分重点：

- 是否有完整、有用的观点
- 是否提供可执行的方法或步骤
- 是否包含案例、例子或数据
- 是否有值得传播的原文表达
- 是否不依赖大量前后文也能理解
- 表达是否清晰
- 是否具有二次传播潜力

以下内容应降低评分：

- 闲聊
- 过渡和流程性话语
- 重复内容
- 论述不完整
- 严重依赖前文
- 转写明显损坏

### 9.3 排序与去重

候选首先按 `finalScore` 从高到低排序。

如果两个候选的重叠时长超过较短候选的 80%，只保留高分者。随后进行一次语义去重，移除时间重叠不高、但表达同一知识单元的重复候选。

系统最多保存 TOP 10，默认展示 TOP 5。高质量候选不足时，不用低质量内容强行凑满十个。

### 9.4 边界修正

选出 TOP N 后，DeepSeek 根据候选附近的转写片段提出边界调整建议，应用代码再校验并对齐已有时间戳。

修正要求：

- 不从半句话开始
- 去除无关寒暄和过渡
- 保留最终结论
- 除非有明确理由，否则保持在设定时长范围内

### 9.5 标题与候选信息生成

只对最终入选的 TOP N 生成完整信息，以降低调用成本。

每个候选的数据结构：

```ts
type ClipCandidate = {
  id: string;
  rank: number;
  finalScore: number;
  type: "观点" | "方法" | "案例" | "避坑" | "对比" | "总结" | "金句";
  startMs: number;
  endMs: number;
  durationMs: number;
  titleOptions: [string, string, string];
  selectedTitle: string;
  summary: string;
  quote: string;
  recommendationReason: string;
  riskNotices: string[];
  subtitles: SubtitleLine[];
  previewStatus: PreviewStatus;
};
```

标题必须忠于片段内容，不得承诺原视频中没有的信息。

重新生成候选只复用已有 transcript，不重复执行 ASR。MVP 每个项目允许重新生成一次。

## 10. DeepSeek 稳定性

Worker 使用 OpenAI 兼容客户端：

```text
接口地址：https://api.deepseek.com
响应格式：json_object
思考模式：关闭
```

所有响应必须通过应用数据结构校验。

以下情况触发重试：

- 空响应
- JSON 格式错误
- 数据结构不匹配
- 响应被截断
- 请求限流
- 临时服务错误

最多重试三次，采用指数退避。失败的批次必须能够单独重试。

模型名始终由环境变量配置，后续切换模型不需要修改业务代码。

## 11. 导出架构

### 11.1 快速导出

快速导出在浏览器本地完成：

```text
clip.mp4
clip.srt
clip.txt
cover.jpg
```

Clipwise 优先尝试快速无损切片。如果关键帧位置造成边界不准确，则回退到本地精确重编码。

界面可以使用“快速切片”和“精确切片”描述处理方式，但不向用户暴露复杂 FFmpeg 术语。

### 11.2 批量导出

TOP 5 按顺序逐个处理，以控制内存占用，最终生成一个 ZIP，包含：

- 5 个 MP4
- 5 个 SRT
- 5 个 TXT
- 5 张 JPG 封面图

每完成一个片段就释放对应的浏览器临时数据。

### 11.3 带字幕视频

处理流程：

```text
浏览器只切出当前短片
→ 上传短片和编辑后的字幕
→ Python Worker 使用 FFmpeg 烧录字幕
→ 返回最终 MP4
```

完整回放始终不上传。MVP 每次只处理一个带字幕视频。

## 12. 后端架构

仓库结构：

```text
clipwise/
├── apps/web
├── services/worker
├── packages/shared
├── infra
└── references
```

### 12.1 Next.js 职责

- 页面和用户交互
- 轻量业务 API
- 项目和候选数据读写
- 上传流程编排
- 返回任务状态

### 12.2 Python Worker 职责

- Groq ASR
- 转写标准化
- DeepSeek 评分与候选信息生成
- 字幕烧录
- 过期文件清理

### 12.3 Postgres 职责

核心数据表：

```text
projects
project_files
transcript_segments
clip_candidates
subtitle_lines
jobs
export_artifacts
```

任务类型：

```text
transcribe_audio
generate_candidates
regenerate_candidates
burn_subtitles
cleanup_expired_files
```

任务状态：

```text
pending
running
succeeded
failed
```

Worker 使用数据库锁领取任务，防止同一任务被重复执行。

## 13. API 设计

```text
POST   /api/projects
POST   /api/projects/:token/audio
GET    /api/projects/:token
GET    /api/projects/:token/clips
POST   /api/projects/:token/reconnect
PATCH  /api/projects/:token/candidates/:id
POST   /api/projects/:token/regenerate
POST   /api/projects/:token/subtitled-export
GET    /api/tasks/:taskId
GET    /api/tasks/:taskId/events
```

本地快速导出不调用服务端接口。

## 14. SSE 任务进度

### 14.1 页面流程

音频上传成功后，服务端返回：

```json
{
  "projectToken": "project-token",
  "taskId": "task-id"
}
```

前端导航到：

```text
/project/[token]/tasks/[taskId]
```

任务页面建立 SSE 连接：

```text
GET /api/tasks/:taskId/events
Accept: text/event-stream
```

正常情况下，前端只通过 SSE 接收进度，不同时运行普通轮询。

### 14.2 SSE 数据格式

每条任务进度消息至少包含：

```ts
type TaskProgressEvent = {
  taskId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
  updatedAt: string;
};
```

SSE 消息使用任务更新时间或单调递增序号作为 `id`，支持浏览器断线重连时携带 `Last-Event-ID`。

事件类型：

```text
progress
completed
failed
heartbeat
```

用户界面只展示产品化状态文字，例如：

```text
正在识别语音
正在分析内容
正在生成候选片段
```

不得直接展示 Worker 日志、模型名或数据库状态。

### 14.3 服务端推送

MVP 的 SSE 路由每秒查询一次数据库中的任务记录，并向当前连接推送一条进度信息。

任务数据应至少保存：

```text
task_id
status
progress
message
updated_at
```

当任务进入 `succeeded` 或 `failed` 后：

1. 推送最终事件。
2. 关闭 SSE 流。
3. 前端停止所有兜底轮询和重连。

用户量或任务时长明显增长后，优化为：

- 数据库查询间隔从 1 秒调整为 3 秒。
- 只有任务进度、状态或文字发生变化时才推送。
- 无变化期间只发送低频 `heartbeat`。

### 14.4 五秒轮询兜底

普通轮询仅在以下情况启用：

- SSE 触发 `error` 并断开。
- 连续 8 秒没有收到 SSE 消息。
- 浏览器从离线恢复为在线。
- 页面从后台恢复后发现连接已经失效。

兜底接口：

```text
GET /api/tasks/:taskId
```

兜底轮询间隔为 5 秒。SSE 恢复后必须立即停止轮询，避免两套请求常驻运行。

兜底用于处理：

- 用户切换 Wi-Fi
- 防火墙或代理终止长连接
- 弱网造成连接失效
- 浏览器休眠后恢复

### 14.5 任务完成后的数据获取

SSE 只传递任务进度，不在事件中传输完整 clips。

收到 `completed` 后：

1. 关闭 `EventSource`。
2. 停止五秒轮询。
3. 一次性请求：

```text
GET /api/projects/:token/clips
```

4. 将项目页面切换为候选就绪状态。

任务完成后的 clips 只拉取一次，不再继续轮询。

### 14.6 SSE 测试要求

- 正常连接每秒收到任务进度。
- 前端能够根据 `progress` 和 `message` 更新界面。
- SSE 断开后启动五秒轮询。
- SSE 恢复后停止轮询。
- 重复或过期事件不会让进度倒退。
- 收到 `completed` 后只请求一次 clips。
- 收到 `failed` 后展示可重试状态。
- 组件卸载时关闭 `EventSource` 并清理所有定时器。

## 15. 存储与隐私

- 原始完整回放：永不上传。
- 压缩音频：ASR 成功后删除，最长保存 24 小时。
- 用户上传的短片：保存 24 小时。
- 带字幕视频：保存 7 天。
- Transcript 和候选数据：保存 7 天。
- 编辑后的文案和字幕：保存 7 天。

MVP 使用服务器本地磁盘，并通过 `StorageProvider` 接口封装。后续可以迁移至 OSS、COS、R2 或 S3。

项目使用高随机私密 token 访问，不要求登录。

## 16. 失败恢复

所有长任务必须记录稳定的错误代码和面向用户的简洁说明。

可重试阶段：

- 音频提取
- 音频上传
- 单个 ASR 分块
- 单个 DeepSeek 评分批次
- 单个候选信息生成批次
- 本地视频导出
- 短片上传
- 字幕烧录

视频导出失败时，已经编辑的文本必须保留。

项目过期后展示明确的过期状态，不使用普通“未找到”或“服务器错误”页面代替。

## 17. 测试策略

### 17.1 前端单元与组件测试

- 选择候选不会标记为已预览
- 播放达到 80% 后标记为已预览
- 播放到片段结尾自动暂停
- 关联文件不匹配时禁止预览和导出
- 自动保存状态转换
- 未预览导出提醒
- 不同项目状态下的候选卡片和 Tab 操作权限
- SSE 消息更新任务进度
- SSE 断线后启用轮询兜底
- SSE 恢复后停止轮询
- 任务完成后只拉取一次 clips

### 17.2 Worker 测试

- Groq 分块时间偏移与重叠合并
- 滑动窗口生成
- DeepSeek JSON 校验和重试
- 分数排序
- 80% 时间重叠去重
- 语义去重
- 高质量候选不足 TOP N 时的行为
- 字幕时间转换

### 17.3 集成测试

- 使用模拟 Provider 从创建项目运行到候选就绪
- 重新关联原视频
- 编辑文案和字幕
- 重新生成候选时不重复 ASR
- 带字幕视频任务的完整生命周期
- SSE 进度、断线兜底与完成事件

### 17.4 浏览器验收测试

至少使用一个真实直播回放跑通：

```text
选择视频
→ 转写
→ 生成候选
→ 真实预览
→ 编辑
→ 导出 MP4 + SRT + TXT
```

## 18. 分阶段交付

### 18.1 第一阶段：生产级前端闭环

- 建立项目仓库
- 保存需求文档和原型参考文件
- 实现 Next.js 上传页和项目页
- 接入真实本地播放器
- 实现完整前端状态机
- 使用模拟 Provider 和固定候选数据
- 验证所有前端状态

### 18.2 第二阶段：真实 AI 管线

- FFmpeg.wasm 音频提取
- Groq 转写
- DeepSeek 评分和候选信息生成
- Postgres 任务与数据持久化
- 页面刷新恢复和原视频重新关联

### 18.3 第三阶段：真实导出

- 本地生成 MP4、SRT、TXT 和 JPG
- TOP 5 ZIP
- 服务端字幕烧录
- 过期文件清理

### 18.4 第四阶段：SSE 任务进度

- 上传完成后导航到任务页面
- 订阅任务 SSE
- 展示进度、状态文字和任务 ID
- 服务端每秒查询数据库并推送
- SSE 断开后启用五秒轮询兜底
- SSE 恢复后停止轮询
- 任务完成后一次性拉取 clips

## 19. 明确不做

MVP 不包含：

- 直播实时处理
- 平台链接解析和下载
- 自动发布
- 智能竖屏重构
- 账号和团队协作
- 永久媒体存储
- 专业时间轴编辑器
- 转场、BGM、滤镜和复杂字幕动画
- 移动端视频处理

## 20. 环境变量

服务端配置示例：

```bash
DATABASE_URL=

GROQ_API_KEY=
GROQ_ASR_MODEL=whisper-large-v3

DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

STORAGE_ROOT=
PROJECT_RETENTION_DAYS=7
SHORT_CLIP_RETENTION_HOURS=24
```

任何服务商密钥都不能通过 `NEXT_PUBLIC_*` 环境变量暴露给前端。

## 21. 参考项目归属

Clipwise 的滑动窗口候选生成、LLM 评分、按分数排序、时间重叠过滤、TOP N 选择和独立标题生成阶段，参考并改造自 MIT 许可证项目 `toki-plus/ai-highlight-clip`。
