# Clipwise Phase 5.1 剪辑师素材召回设计

## 1. 目标

Phase 5.1 将 Phase 5 的「知识高光精选器」升级为「剪辑师素材召回器」。

真实业务目标是：剪辑师把一场 3 小时直播回放丢进系统，系统夜间分析后给出约 30 条 1–3 分钟的片段建议；剪辑师第二天快速浏览 AI 结果，从中挑 2–3 条值得精修的素材。

因此 Phase 5.1 的判断问题不是：

> 这段能不能直接成为爆款成片？

而是：

> 这段是否值得剪辑师点开看一眼，并且有机会被剪成一条独立短视频？

完成后的主链路：

```text
transcript_segments
→ 生成 1–3 分钟滑动窗口
→ DeepSeek 按剪辑师召回维度评分
→ 持久化所有窗口评分与淘汰原因
→ 规则初筛与时间去重
→ DeepSeek 语义去重、边界微调和推荐档位确认
→ 主题分散选择约 30 条素材建议
→ 生成剪辑师字段和标题/摘要/金句
→ 写入 clip_candidates / subtitle_lines
→ 项目页展示推荐档位、剪辑建议和风险
```

## 2. 非目标

Phase 5.1 不解决以下问题：

- 不实现 3 小时视频的完整音频分片、偏移合并和重叠段清洗；这是 Phase 4.1。
- 不实现一键导出 30 个 MP4 到本地；这是 Phase 6.1。
- 不把完整原始 MP4 上传服务器。
- 不在 DeepSeek 或 Groq 失败时补假候选。
- 不用通用 mock 数据伪装真实分析成功。

Phase 5.1 允许在当前 8 分钟真实样本上输出少于 30 条建议。30 条是长直播目标，不是短样本必须补足的数量。

## 3. 当前问题

Phase 5 已经实现真实链路，但仍偏「精选」：

- 最终最多写入 10 条候选。
- `finalScore >= 60` 后按分数排序，低分窗口直接丢弃。
- 页面推荐档位由前端按分数推导：`>=85` 强推荐，`>=65` 推荐，其余可选。
- 数据库只保存最终 clip，不保存被淘汰窗口的评分、否决项或原因。
- DeepSeek 评分提示词以观点完整性、方法价值、传播价值为主，偏内容评审，而非剪辑师选材。
- 主题分散只靠时间重叠与语义去重，不能保证 Top 30 不集中在同一个话题。

这些问题导致用户看到「8 分钟只有 3 个候选」时，系统无法回答：

- 每个 90 秒窗口到底得了多少分？
- 其它窗口为什么被淘汰？
- 强推荐、推荐、可选的依据是什么？
- 如果目标是剪辑师召回，为什么不多给一些 backup 素材？

## 4. 数据契约

### 4.1 推荐档位

新增模型直接输出的离散档位：

```text
strong       强推荐：剪辑师应优先看，具备明确短视频潜力
recommended 推荐：值得看，有清晰内容价值或可剪空间
backup      备选：有局部价值，但需要剪辑师判断是否值得加工
reject      淘汰：不建议进入最终片段列表
```

`finalScore` 继续保留，范围仍为 `0–100` 整数，但它只用于同档位内排序和调试，不再单独决定推荐标签。

### 4.2 评分维度

每个窗口输出 4+1 结构：

```json
{
  "windowId": "window-0001",
  "recommendation": "recommended",
  "finalScore": 76,
  "dimensions": {
    "informationDensity": 4,
    "hookStrength": 3,
    "standaloneClarity": 4,
    "editability": 4
  },
  "rejectionReason": "none",
  "topicLabel": "AI 项目报价与业务价值",
  "type": "方法",
  "recommendationReason": "有明确判断标准和可复述结论，适合剪成教程/观点段。"
}
```

四个正向维度均为 `1–5` 整数：

- `informationDensity`：是否包含观点、方法、判断标准、案例或可迁移经验。
- `hookStrength`：是否有冲突、反常识、利益点、悬念、金句或标题点。
- `standaloneClarity`：不看前后文是否能理解核心意思。
- `editability`：是否能剪成 1–3 分钟片段，是否有自然起承转合或可补开头。

否决项使用枚举：

```text
none
small_talk
transition
fragmented
duplicate
low_information
asr_noise
too_context_dependent
promotion_or_admin
```

当 `rejectionReason != none` 时，`recommendation` 通常应为 `reject`；只有 `too_context_dependent` 可以作为 `backup`，并要求 `needsSetup=true`。

### 4.3 剪辑师字段

最终候选新增字段：

```json
{
  "topicLabel": "AI 项目报价与业务价值",
  "editingNote": "开头可补一句“为什么同样做 AI，报价差 10 倍？”再接原文。",
  "boundaryReason": "从讲报价判断标准开始，到给出结论后结束，去掉后面的转场闲聊。",
  "needsSetup": true,
  "recommendation": "recommended",
  "rejectionReason": "none"
}
```

字段语义：

- `topicLabel`：短、稳定、可聚类的话题标签，用于主题分散和列表扫读。
- `editingNote`：给剪辑师的实际处理建议，不是给观众看的文案。
- `boundaryReason`：解释为什么从这里开始、到这里结束。
- `needsSetup`：是否需要剪辑师补一句开场说明或从前文借一句上下文。

### 4.4 严格结构化输出

DeepSeek 继续使用 Beta strict tool calling。所有新字段都必须进入 Pydantic strict models：

- 禁止额外字段。
- 禁止非法枚举。
- 禁止字符串数字冒充整数。
- 工具 schema 继续内联 `$ref/$defs`。
- DeepSeek 响应后仍执行业务校验。

提示词只解释判断标准，不承担格式可靠性。

## 5. 持久化设计

### 5.1 `clip_candidates` 扩展

给最终候选增加字段：

```text
recommendation text not null default 'recommended'
topic_label text not null default ''
editing_note text not null default ''
boundary_reason text not null default ''
needs_setup boolean not null default false
rejection_reason text not null default 'none'
```

`rejection_reason` 在最终候选中通常为 `none`，保留它是为了 API 结构一致，也便于后续展示 backup 素材的弱点。

### 5.2 新增窗口评分表

新增 `highlight_window_scores`：

```text
id text primary key
project_token text not null references projects(token) on delete cascade
window_id text not null
start_ms bigint not null
end_ms bigint not null
duration_ms bigint not null
segment_ids text[] not null
text_preview text not null
recommendation text not null
final_score integer not null
type clip_type not null
information_density integer not null
hook_strength integer not null
standalone_clarity integer not null
editability integer not null
rejection_reason text not null
topic_label text not null
recommendation_reason text not null
selection_status text not null
selection_reason text not null
duplicate_of_window_id text
created_at timestamptz not null default now()
```

`selection_status` 枚举语义使用文本保存，首版允许：

```text
scored
below_recall_threshold
time_duplicate
semantic_duplicate
topic_diversity_skipped
selected
rejected
```

这张表的目的不是给用户看完整转写，而是保存可解释审计轨迹。`text_preview` 最多保存窗口前 240 个字符，避免重复存大段 transcript；完整文本仍以 `transcript_segments` 为真源。

每次重新生成候选时，事务内删除当前项目旧的 `highlight_window_scores`、`clip_candidates`、`subtitle_lines`，再写入新结果。若重新生成失败，保留旧候选和旧评分表。

## 6. 召回与筛选策略

### 6.1 窗口生成

Phase 5.1 默认参数：

```text
目标窗口：120 秒
最短窗口：60 秒
最长窗口：180 秒
步长：45 秒
```

原因：用户目标片段是 1–3 分钟。Phase 5 的 45–150 秒偏短，容易把一个完整观点切得太紧。120 秒目标更贴近剪辑师拿到的素材段。

窗口仍以 transcript segment 边界对齐，不创建人工时间点。

### 6.2 初筛阈值

召回阶段不以 60 分作为硬精选线。首版使用：

```text
strong/recommended：优先进入最终候选池
backup：允许进入候选池，但排在同主题 strong/recommended 后面
reject：不进入最终候选池
```

额外保护：

- `finalScore < 45` 的窗口即使不是 `reject` 也不进入最终候选池。
- `rejectionReason` 为 `small_talk`、`transition`、`fragmented`、`asr_noise`、`promotion_or_admin` 时强制淘汰。
- `too_context_dependent` 只允许进入 `backup`，且最终候选必须 `needsSetup=true`。

这些阈值是可校准参数，必须在代码中集中定义，不散落在 prompt 或 UI。

### 6.3 时间去重

沿用确定性时间重叠去重，但服务 30 条召回时阈值调整为：

```text
overlap / min(duration_a, duration_b) > 0.7 视为时间重复
```

排序优先级：

1. recommendation 档位：strong > recommended > backup。
2. finalScore 高者优先。
3. `needsSetup=false` 优先。
4. 开始时间更早者优先。

### 6.4 语义去重与边界微调

DeepSeek 语义去重阶段继续只引用输入 `windowId` 和 `segmentIds`。新增职责：

- 识别同一知识点的重复窗口。
- 给每个候选选择更自然的起止 segment。
- 输出 `boundaryReason`。
- 输出或修正 `needsSetup`。

业务校验继续保证：

- 每个输入候选恰好返回一次。
- keep 的候选不能指向 duplicate。
- duplicate 目标必须存在。
- 边界必须落在原窗口 segment 范围内。
- 调整后时长必须为 60–180 秒。

如果 DeepSeek duplicate 决策不一致，继续沿用 Phase 5 的本地确定性纠偏：指向不存在/未保留候选或分数更低候选时，本地保留 source，不放松其它校验。

### 6.5 主题分散

最终选择不再纯按 Top-N 分数。选择器按 `topicLabel` 做软配额：

```text
目标数量：30
单一 topicLabel 默认最多 4 条
strong 不受 topic 上限硬淘汰，但超过上限后排到下一轮
recommended 每轮每主题最多取 1 条
backup 只在 strong/recommended 不足时补位
```

算法：

1. 将候选按标准排序。
2. 按 `topicLabel` 分桶。
3. 第一轮每个主题取 1 条 strong/recommended。
4. 第二轮继续取未满上限的 strong/recommended。
5. 若不足目标数量，用 backup 补齐，但仍遵守主题上限。
6. 若仍不足，按全局排序补齐，不制造假候选。

短视频样本不足时可以少于 30 条；长直播样本才以 30 条为目标。

## 7. DeepSeek 提示词口径

### 7.1 评分提示词

评分模型身份从「知识类直播高光评审」改为：

> 你是服务剪辑师的直播回放素材筛选助手。你的任务不是判断最终爆款，而是判断这段是否值得剪辑师点开看一眼。

必须明确：

- 宁可把有潜力但需要剪辑的段落标为 `backup`，不要过早淘汰。
- 纯寒暄、过渡、重复、行政信息、ASR 噪声必须 reject。
- 不要因为观点还不够标题党就 reject；只要信息密度和可剪空间足够，可以 recommended。
- `topicLabel` 应稳定、短小，避免每个窗口都生成完全不同的话题名。

### 7.2 详情提示词

详情阶段输出标题、摘要、原文金句、风险提示，并新增：

- `editingNote`
- `boundaryReason`
- `needsSetup`

`quote` 仍必须逐字来自候选文本。`editingNote` 可以是建议，但不得伪造原文事实。

## 8. 前端展示

共享领域模型新增：

```ts
type Recommendation = "strong" | "recommended" | "backup" | "reject";
```

候选卡片展示：

- `strong` → 强推荐
- `recommended` → 推荐
- `backup` → 备选

最终候选列表默认不展示 `reject`，因为 reject 只在窗口评分表中用于解释和调试。

候选卡新增扫读信息：

- 推荐档位
- 分数
- `topicLabel`
- `needsSetup` 标记
- 推荐理由

详情区新增「剪辑建议」：

- `editingNote`
- `boundaryReason`
- `riskNotices`
- `needsSetup`

Phase 5.1 不要求做完整的淘汰窗口 UI。可先通过 API/数据库保留评分轨迹，后续再做「为什么只有这些候选」的调试面板。

## 9. API 与兼容

`GET /api/projects/:token` 和 `GET /api/projects/:token/clips` 返回新增字段。

旧 fixture 和 seed 需要补默认值：

```text
recommendation: "recommended"
topicLabel: type 或简短主题
editingNote: ""
boundaryReason: ""
needsSetup: false
rejectionReason: "none"
```

PATCH 候选编辑首版不允许编辑 Phase 5.1 新字段，避免剪辑建议与 AI 审计字段被用户误改。标题、摘要、金句、风险提示和字幕仍按现有逻辑编辑。

## 10. 错误处理

保持 Phase 5 的真实性边界：

- DeepSeek 评分失败：任务失败，不写假数据。
- 全部窗口 reject：初次生成项目 failed；重新生成保留旧候选。
- 最终候选不足 30：正常 ready，不补假候选。
- `quote` 不可溯源：详情批次重试，耗尽后失败。
- 新字段缺失或非法：批次重试，耗尽后失败。

窗口评分持久化只有在候选生成整体成功时写入。失败任务不落半成品评分表，避免用户看到不完整解释。

## 11. 人工标注留出集

Phase 5.1 需要为后续校准预留文件格式，但不要求本阶段完成大量人工标注。

建议路径：

```text
datasets/editor-recall-labels/README.md
datasets/editor-recall-labels/examples.jsonl
```

每行 JSONL：

```json
{
  "source": "直播标题或样本 ID",
  "startMs": 120000,
  "endMs": 240000,
  "label": "keep",
  "idealStartMs": 128000,
  "idealEndMs": 232000,
  "topicLabel": "AI 项目报价",
  "editorNote": "有观点也有例子，值得剪",
  "rejectReason": "none"
}
```

标签枚举：

```text
keep
maybe
reject
```

这个留出集用于后续校准：

- 召回阈值。
- rejectionReason 的严格程度。
- topic 分散上限。
- prompt 是否过早杀掉潜力素材。
- 边界微调是否贴近剪辑师选择。

## 12. 测试策略

### 12.1 Worker

新增或更新测试：

- strict model 拒绝非法 recommendation、rejectionReason 和维度分数。
- score schema 包含新字段且内联 `$ref/$defs`。
- backup 候选可进入候选池，reject 不进入。
- 否决项强制淘汰。
- 时间去重阈值为 0.7。
- 主题分散不会让同一 topic 占满 Top 30。
- 最终候选最多 30，短样本不足时不补假候选。
- 窗口评分表与最终候选同事务替换。
- 重新生成失败时保留旧候选和旧窗口评分。

### 12.2 Web

新增或更新测试：

- shared domain 将 `strong/recommended/backup` 映射为「强推荐/推荐/备选」。
- API mapping 返回新增字段。
- 候选卡展示 topic 和 needsSetup。
- 详情区展示 editingNote 和 boundaryReason。
- fixture/seed 包含默认新字段。

### 12.3 真实验收

用用户 8 分钟视频重新跑一次页面链路，验收点：

- 项目 ready。
- 候选来自真实 DeepSeek，不是 mock。
- 短样本可以少于 30 条。
- 每条候选有 recommendation、topicLabel、editingNote、boundaryReason、needsSetup。
- 数据库存在窗口评分记录，数量等于生成窗口数。
- 至少能解释未入选窗口的 `selection_status`。

长视频 3 小时验收不属于 Phase 5.1；要等 Phase 4.1 完成完整音频分片后再做。

## 13. 开放问题与默认决策

### 13.1 是否允许 backup 出现在最终列表？

默认允许。剪辑师召回阶段的目标是节省找素材时间，不是替剪辑师做最终成片判断。backup 必须排在 strong/recommended 后面，并通过 `editingNote`/`needsSetup` 说明弱点。

### 13.2 是否展示 reject？

默认不在普通项目页展示。reject 留在窗口评分表中，先服务调试与解释。后续可以做管理员/调试面板。

### 13.3 是否立即做到 30 条？

对长直播目标是约 30 条；对 8 分钟样本不补齐。系统应根据有效内容自然输出少量候选。

### 13.4 是否把 `topicLabel` 做向量聚类？

首版不用向量库。先使用模型输出的稳定 topicLabel + 规则软配额。等真实样本积累后再考虑 embedding 聚类。

## 14. 成功标准

Phase 5.1 完成时应满足：

- 生产 Worker 仍无 mock candidate 回退。
- DeepSeek 输出由 strict tool schema + Pydantic + 业务校验约束。
- 最终候选上限从 10 提升为 30。
- 推荐档位由模型输出，而不是前端按分数硬推。
- 每条最终候选包含 `topicLabel`、`editingNote`、`boundaryReason`、`needsSetup`。
- 每个评分窗口都有持久化评分、维度、否决项和选择状态。
- 主题分散逻辑可测试，避免同一主题垄断结果。
- 用户再次问「为什么只有这些候选」时，系统可以基于评分表回答，而不是猜。
