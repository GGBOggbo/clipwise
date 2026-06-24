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
  - 需要内联 `$ref/$defs`，真实调用中嵌套引用没有稳定约束住 enum/extra field。
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
- DeepSeek 语义去重的 duplicate 决策不应直接决定项目成败：
  - 如果 `duplicateOf` 指向未保留候选，本地改为保留当前候选。
  - 如果 `duplicateOf` 指向分数更低的候选，本地改为保留当前高分候选。
  - 这些纠偏只处理去重关系，不放松 quote、字幕、schema 或分数阈值。
- 2026-06-23 Web 页面实测：
  - 用户视频 `/Users/chk/Downloads/飞书20260623-131141.mp4` 约 96.8MB。
  - 直接把原 MP4 给 Groq 会 413；页面路径会先用 ffmpeg.wasm 本地抽音频，真实上传/ASR 成功。
  - 项目 `K2NgL4Gl...`：Groq ASR succeeded，DeepSeek 候选 succeeded，生成 3 条候选，自动溯源 passed。
  - Chrome 1470×720 下复查项目页，视频播放器外框高 280px，但 `<video>` 元素实际布局高约 536.9px，被父容器 `overflow:hidden` 裁掉下半部分；根因是 video/grid/intrinsic ratio 高度协商。已修复为让 video 绝对定位填满播放器框，再由 `object-fit: contain` 在框内缩放。
  - 项目 `K2NgL4Gl...` 的 transcript 共 326 段，覆盖 0–478981ms，滑动窗口生成 10 个约 90 秒窗口，最终只落库 3 条候选；中间 DeepSeek 原始评分和语义去重决策当前未持久化，无法事后精确解释每个淘汰窗口的原因。
- 用户 2026-06-23 新确认的目标流程更偏剪辑师工作流：3h 直播回放上传后，系统夜间处理，给约 30 条 1–3 分钟片段建议，一键导出 30 个 MP4 到本地，剪辑师再从中挑 2–3 条精修。
- 该目标比原 SPEC v0.2 的「默认生成 10 个候选、展示 TOP 5、批量导出 TOP 5」更大；需要把 Phase 4.1 长视频分片、Phase 5 候选上限/召回策略、Phase 6 批量导出目标一起重新校准。
- 2026-06-23 用户提供外部建议稿强调：Phase 5.1 应从「知识高光评审」改成「剪辑师素材召回/选材助手」。建议方向包括：
  - 评分维度从观点完整性等通用内容质量，收敛为信息密度、钩子强度、独立可懂、可剪成片，加上过渡/闲聊/口误/重复等否决项。
  - 召回阶段宁可多给剪辑师筛，不要过早用成片标准淘汰潜力素材。
  - 固定 90 秒窗口容易切断观点；可保留滑动窗口粗扫，但应增加主题边界对齐和边界回退/微调。
  - 60 分阈值和 80% 重叠去重可能偏精选，若目标是 30 条素材召回，可评估降低召回阈值、收紧重复窗口去重。
  - 参考材料本身不是权威来源，且有「已搜索」与「不能联网搜索」表述矛盾；只能作为产品设计输入，不作为事实依据。
- 2026-06-23 用户提供第二份外部建议稿补充 Phase 5.1 三个工程化方向：
  - 不要只依赖 `finalScore` 绝对值切档；让模型直接输出离散推荐档位，例如 strong/recommended/backup/reject，再用分数排序辅助。
  - 主题分散应作为独立步骤处理，例如主题/类型配额、聚类后每簇取头部，不能只靠分数 Top-N，否则 30 条容易集中在同一主题。
  - 建立剪辑师人工标注留出集，用真实直播标注「该留/该杀/边界怎么切」，用于校准阈值、否决项和 prompt；否则 Phase 5.1 只能凭感觉调参。
  - `editingNote`、`boundaryReason`、`needsSetup` 应视为剪辑师工作流的核心产物字段，而非装饰性说明。
- 完整原视频留在浏览器；浏览器通过 FFmpeg.wasm 抽取压缩音频。
- 音频建议 16kHz 单声道、约 20 分钟一块，块之间保留少量重叠。
- 2026-06-23 Phase 5.1 规格决策：
  - 规格文档：`docs/superpowers/specs/2026-06-23-clipwise-phase5-1-editor-recall-design.md`。
  - Phase 5.1 不试图解决 3h 完整音频分片或本地导出；它只校准候选召回、推荐档位、评分解释、主题分散和剪辑师字段。
  - 窗口参数从 Phase 5 的目标 90 秒调整为目标 120 秒，允许 60–180 秒，步长仍为 45 秒，更贴近 1–3 分钟剪辑素材目标。
  - 推荐档位由模型直接输出 `strong`、`recommended`、`backup`、`reject`；`finalScore` 只做同档位排序和调试。
  - `backup` 允许进入最终候选列表，因为召回阶段宁可多给剪辑师看，不应过早按成片标准杀掉潜力素材。
  - `reject` 默认不在普通项目页展示，先落在窗口评分表中用于解释和调试。
  - 评分维度固定为 4+1：`informationDensity`、`hookStrength`、`standaloneClarity`、`editability`、`rejectionReason`。
  - 新增最终候选字段：`recommendation`、`topicLabel`、`editingNote`、`boundaryReason`、`needsSetup`、`rejectionReason`。
  - 新增窗口评分表 `highlight_window_scores`，保存每个窗口的评分维度、否决项、话题、选择状态和淘汰/入选原因。
  - 最终选择使用 topicLabel 软配额：目标 30 条、单主题默认最多 4 条，先分散 strong/recommended，再用 backup 补位；短视频样本不足时不补假候选。
  - 窗口评分表只在整体候选生成成功后与最终候选同事务落库；生成失败不落半成品解释，重新生成失败保留旧候选和旧评分表。

## 测试和验收

- 最新已验证：
  - Phase 5 Worker 单元/集成测试：最新 65 条 Worker 测试通过。
  - Phase 5 Web 非真实集成 smoke：`create-to-ready`、`sse-flow` 已通过。
  - Web 页面真实上传 8 分钟 MP4：生成 3 条候选，项目 ready。
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
  - `e39fa99` 真实 DeepSeek 候选验收与 schema ref 内联
  - `54263c9` 容忍并纠正 DeepSeek 不一致 duplicate 决策

## 未完成边界

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

- Phase 5.1 人工标注留出集路径为 `datasets/editor-recall-labels/`；该数据只用于后续校准，不得被 Worker 生产候选路径作为 mock 或 fallback 读取。
- Phase 4.1 长视频分片的真正瓶颈是前端硬编码 20 分钟时长（`assumedDurationMs`），不是 worker 或 `calculateChunks`；修复方式是用 `<video>` 元素 probe 真实时长。
- Phase 7 并发改造：`claim_next` 的 `FOR UPDATE SKIP LOCKED` 天然并发安全，无需额外锁；并发只需在 `run()` 里用 `asyncio.Semaphore` + `asyncio.create_task`，单进程内够用。多进程部署时再上 Redis 锁。默认 `WORKER_MAX_CONCURRENCY=2`，兼顾吞吐与 Groq/DeepSeek 限流。
- 2026-06-23 用户两次上传同一段约 93 分钟视频，项目 `Shavbar...` 与 `pqtHf4...` 均在候选详情阶段失败：
  - 视频时长记录为 `5,586,925ms`，音频被切为 4 块；4 次 Groq 请求均成功。
  - 两个项目的 transcript 分别有 3468/3495 段，覆盖 `0–5,414,960ms`，说明上传、长音频分块、ASR 和合并均已完成。
  - 失败 job 均为 `generate_candidates`，进度 85，`error_code=deepseek_invalid_response`，消息为“候选详情包含空摘要或非原文金句”。
  - 根因是 `generate_candidate_details()` 只做 strict schema/ID 校验；“摘要非空、quote 必须为原文子串”的业务校验在所有详情批次完成后才执行。只要任一候选不合格，整个项目失败，且该业务错误不会触发 DeepSeek 的 3 次重试。
  - 推荐修复：每个详情批次立即做业务校验，仅重试失败批次；不得自动伪造或替换 quote 来制造成功结果。
- 2026-06-23 90 分钟恢复验证：
  - 因 Web/Worker 测试共用开发库，旧 `create-project.test.ts` 的 `delete where token != demo-project` 误删了用户真实项目；已修为只清理测试自己创建的项目。
  - 使用原始本地视频 `/Users/chk/Downloads/b1e452ef1605cca397334e2184419070.mp4` 恢复项目 `RhYJwCB_Vp1UqxDnGQYUAPHDgCRucQ9Q`；完整 MP4 没有上传。
  - 源视频 AAC 中后段有解码损坏；ffmpeg/此前 ASR 均只能稳定覆盖到约 `5414s`，不是 `5587s` 末尾。
  - 修复了三个真实长视频放大的 DeepSeek 容错点：详情 quote 非原文按批次重试、`keep=true` 时忽略自相矛盾的 `duplicateOf`、非法边界回退原始窗口。
  - 最终项目 ready，生成 30 条真实候选、117 条窗口评分审计；检查通过：rank 连续、时长 60–180 秒、字幕边界一致、quote 为原文。
- 2026-06-24 失败重试语义修复：
  - `POST /api/projects/:token/regenerate` 不再对 failed 项目无脑创建 `regenerate_candidates`。
  - failed 项目如果已有 `transcript_segments`，重试只创建 `generate_candidates`，复用 ASR 文本，不重新上传、不重新抽音频、不重新调用 Groq。
  - failed 项目如果没有 transcript 但仍有 `project_files.kind='compressed_audio'`，重试创建 `transcribe_audio`，从 ASR 断点继续。
  - failed 项目如果 transcript 和 compressed_audio 都没有，返回 `409 retry_not_available`，提示用户重新上传视频；不会假装可以恢复。
  - `regeneration_count` 只用于 ready 项目的主动重新生成；failed 项目的断点恢复不消耗重新生成次数。
  - Worker 在 `no_audio` 和 `asr_chunk_failed` 时会同步把项目状态置为 `failed`，避免任务失败但项目页仍停留在 `transcribing` 而没有重试入口。
  - 项目失败页按钮文案改为“从失败阶段重试”；不可恢复时展示后端返回的重新上传提示。

---

*任何新的外部资料、浏览器发现和技术调研结果优先写入本文件。*
