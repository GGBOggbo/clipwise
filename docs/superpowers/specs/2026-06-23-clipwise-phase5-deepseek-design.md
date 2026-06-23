# Clipwise Phase 5 DeepSeek 高光发现设计

## 1. 目标

Phase 5 将已经落库的真实 `transcript_segments` 转换为真实候选片段，替换当前固定 `mock_ai` 候选生成路径。

完成后的主链路：

```text
真实 transcript
→ 滑动窗口
→ DeepSeek 批量评分
→ 时间重叠去重
→ DeepSeek 语义去重与边界选择
→ TOP 10 候选信息生成
→ 事务写入 clip_candidates / subtitle_lines
→ 项目页展示真实候选
```

Phase 5 不包含本地视频切片、SRT/TXT/JPG/ZIP 导出或字幕烧录；这些属于 Phase 6。

## 2. 不可妥协的真实性边界

生产任务中不得生成或回退到固定模拟候选。

以下情况都必须明确失败：

- 项目没有 transcript。
- `DEEPSEEK_API_KEY` 未配置。
- DeepSeek 请求持续失败。
- 返回空响应、非法 JSON 或不符合数据契约。
- 所有窗口的 `finalScore` 均低于 60。
- 最终候选信息无法通过原文溯源校验。

初次生成失败时，不写入任何候选。重新生成失败时，保留已有的真实候选，不用模拟数据替换。

测试可以使用受控的假客户端响应，但生产代码不得包含 `mock_ai` 分支、固定候选 fixture 或“失败后假装成功”的回退路径。

## 3. 总体架构

采用三阶段管线。

### 3.1 阶段 A：确定性窗口生成

Worker 从 PostgreSQL 按 `index` 读取项目全部 `transcript_segments`，生成对齐完整 segment 边界的滑动窗口。

默认参数：

```text
目标时长：90 秒
最短时长：45 秒
最长时长：150 秒
滑动步长：45 秒
最低质量分：60
评分批次大小：12 个窗口
语义去重输入上限：30 个候选
详情生成批次大小：5 个候选
```

窗口包含：

```text
window_id
start_ms
end_ms
segment_ids
text
```

`window_id` 由本次任务内的确定性顺序生成，不由模型创建。模型只能引用已有 ID。

### 3.2 阶段 B：批量评分与初筛

DeepSeek 分批接收窗口，返回：

```json
{
  "items": [
    {
      "windowId": "window-0001",
      "finalScore": 87,
      "type": "方法",
      "recommendationReason": "步骤完整，可独立理解并直接应用。"
    }
  ]
}
```

评分重点：

- 观点是否完整、有用。
- 是否提供方法、步骤、案例或数据。
- 是否存在值得传播的原文表达。
- 是否不依赖大量前后文。
- 表达是否清晰。
- 是否具有二次传播价值。

闲聊、过渡、重复、残缺论述、严重依赖上下文和损坏转写应降低分数。

模型直接给出 `0–100` 的整数 `finalScore`，应用代码不再计算额外加权分。

批次结果必须逐项校验：

- `windowId` 必须来自输入批次。
- 每个 ID 最多出现一次。
- `finalScore` 必须是 `0–100` 整数。
- `type` 必须属于既有七种候选类型。
- 推荐理由必须是非空字符串。
- 不允许缺失输入窗口或返回额外窗口。

任何一项失败，整个批次判为失败并进入重试。

评分批次固定为最多 12 个窗口。每个批次都携带完整窗口文本，但不携带项目文件名、token 或其他不参与判断的元数据。

### 3.3 阶段 C：去重、边界和完整信息

评分完成后，应用代码先按以下规则确定性筛选：

1. 按 `finalScore` 降序排列。
2. 分数相同时按开始时间升序。
3. 过滤 `finalScore < 60` 的窗口。
4. 若两个窗口重叠时长超过较短窗口的 80%，只保留排序靠前者。

确定性筛选后最多取前 30 个候选交给 DeepSeek 做一次语义去重与边界选择。模型可以：

- 标记表达同一知识单元的候选为重复项。
- 从输入候选中选择保留项。
- 在候选附近的 transcript segment 范围内建议新的起止 segment。

语义去重请求中的每个候选包含 `windowId`、分数、类型、推荐理由、segment ID 列表和原文。响应格式：

```json
{
  "items": [
    {
      "windowId": "window-0001",
      "keep": true,
      "duplicateOf": null,
      "startSegmentId": "segment-id-1",
      "endSegmentId": "segment-id-8"
    }
  ]
}
```

每个输入候选必须恰好返回一次。`keep=false` 时 `duplicateOf` 必须引用同批次中分数不低于它的保留候选；`keep=true` 时 `duplicateOf` 必须为 `null`。

模型不得创建输入中不存在的时间戳或 segment ID。应用代码将建议边界重新对齐到真实 transcript segment，并校验：

- 开始时间小于结束时间。
- 时长必须处于 45–150 秒；不为短于 45 秒的内容设置例外。
- 调整后的区间不能越出该候选允许的上下文范围。
- 不得引用其他项目或不存在的 segment。

最多选出 TOP 10。高质量候选不足时不补足数量。

只对最终候选调用完整信息生成，每批最多 5 个候选，输出：

```json
{
  "items": [
    {
      "windowId": "window-0001",
      "titleOptions": ["标题一", "标题二", "标题三"],
      "summary": "摘要",
      "quote": "来自原始 transcript 的逐字金句",
      "riskNotices": []
    }
  ]
}
```

`selectedTitle` 默认取 `titleOptions[0]`。推荐理由、类型和分数沿用评分阶段结果。

## 4. Transcript 与字幕是真源

`transcript_segments` 是候选边界、正文、金句和字幕的唯一事实来源。

### 4.1 金句校验

最终 `quote` 去除普通空白差异后，必须能在候选范围内拼接后的 transcript 文本中找到。

普通空白差异仅包括空格、制表符、换行和全角空格；标点、汉字、字母和数字不得被忽略或改写。

模型不得：

- 将原文改写后称为原文金句。
- 合并相距很远的句子。
- 添加 transcript 中不存在的信息。

找不到原文时，该候选信息批次判为无效并重试。重试耗尽后整个任务失败，不用摘要或标题代替金句。

### 4.2 字幕生成

字幕不由 DeepSeek 编造。

候选的 `subtitle_lines` 直接复制落在最终时间范围内的 `transcript_segments`：

- 保留真实 `start_ms`、`end_ms` 和 `text`。
- 为新的 subtitle row 生成新 UUID。
- `index` 按时间顺序连续排列。
- 候选边界必须与第一条和最后一条字幕边界一致。

## 5. DeepSeek 客户端

Worker 使用 DeepSeek 官方 OpenAI 兼容接口。

默认配置：

```text
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
思考模式：disabled
response_format：json_object
请求参数：extra_body={"thinking": {"type": "disabled"}}
```

截至 2026-06-23，DeepSeek 官方 API 支持 `deepseek-v4-flash`、非思考模式和 JSON Output。模型名始终来自环境变量，以便后续切换。

客户端接口按职责拆分：

```python
class DeepSeekClient:
    def score_windows(self, windows: list[CandidateWindow]) -> list[ScoredWindow]: ...
    def select_unique_candidates(
        self,
        candidates: list[ScoredWindow],
    ) -> list[BoundaryDecision]: ...
    def generate_candidate_details(
        self,
        candidates: list[FinalCandidateInput],
    ) -> list[CandidateDetails]: ...
```

具体实现使用 `openai` Python SDK，业务管线依赖上述接口，不直接构造 SDK 请求。测试通过注入受控客户端验证真实业务规则。

## 6. JSON 校验与重试

所有模型响应必须经过显式的数据结构校验，不能依靠字典的宽松访问继续执行。

触发重试的情况：

- 网络错误或请求超时。
- HTTP 429。
- HTTP 5xx。
- 空响应。
- JSON 解析失败。
- 响应被截断。
- 缺失字段或字段类型错误。
- 未知、重复或缺失 ID。
- 越界分数、非法类型或非法边界。
- 金句无法在原文中找到。

每个调用批次最多尝试三次，退避间隔为 `1s → 2s`。测试可注入零延时 sleeper。

不重试的情况：

- API key 未配置。
- 项目没有 transcript。
- 数据库事务失败。
- 应用内部不变量被破坏。

每个批次独立重试；已经成功的评分批次无需因另一个批次的临时失败而再次请求。

## 7. 数据库写入与原子性

整个候选集合先在内存中完成并通过校验，最后才写数据库。

事务步骤：

1. 删除该项目旧的 `clip_candidates`；外键级联删除旧字幕。
2. 按最终排名插入候选。
3. 插入候选对应的真实字幕行。
4. 更新项目状态为 `ready`。
5. 提交事务。

任何写入失败都回滚，不允许数据库中出现半套候选。

初次生成与重新生成使用同一套真实管线：

- `generate_candidates` 成功后写入首套真实候选。
- `regenerate_candidates` 复用已有 transcript，不重新执行 ASR。
- 重新生成必须先在事务外完成所有 DeepSeek 调用和校验。
- 重新生成事务失败或模型失败时，旧候选保持不变，项目恢复 `ready`。

候选 ID 使用项目 token 与新 UUID 组合，避免全局主键冲突。

## 8. 任务状态与错误处理

候选生成任务采用真实进度：

```text
10 读取转写
20 生成候选窗口
30–60 DeepSeek 批量评分
65 时间去重
70–80 语义去重与边界选择
85–95 生成完整候选信息
100 候选生成完成
```

稳定错误码：

```text
missing_deepseek_key
no_transcript
deepseek_request_failed
deepseek_invalid_response
no_quality_candidates
candidate_persist_failed
```

初次生成失败：

- job 标记 `failed`。
- project 标记 `failed`。
- 不写候选。

重新生成失败：

- job 标记 `failed`。
- project 恢复 `ready`。
- 旧候选保持可读可编辑。

前端继续使用既有 SSE 和轮询机制展示任务失败。Phase 5 只补充稳定错误码和正确的 project 状态，不扩展新的重试 UI。

## 9. 生产 Mock 清理

完成 Phase 5 后：

- 删除 `services/worker/clipwise_worker/mock_ai.py`。
- `pipeline.py` 不再导入或调用 `generate_mock_candidates`。
- 更新依赖 mock AI 的 Worker 测试。
- 保留 `packages/shared` 的 demo fixture，仅用于种子项目和前端组件测试，不得进入真实 Worker 任务。
- 集成测试创建的新项目必须通过真实候选管线或注入测试 DeepSeek 服务，不能断言固定七个候选。

## 10. 测试策略

严格按测试驱动开发执行。

### 10.1 纯函数测试

- 空 transcript 不生成窗口。
- 窗口对齐完整 segment。
- 目标 90 秒、45–150 秒、45 秒步长。
- 尾部不足最短时长时不创建残缺窗口。
- 分数排序稳定。
- 80% 时间重叠去重。
- 高质量候选不足 10 个时不补足。
- 边界建议只能映射到真实 segment。
- quote 必须来自候选原文。

### 10.2 DeepSeek 客户端测试

- 请求使用配置的 base URL 和 model。
- 请求启用非思考模式与 JSON Output。
- 评分、语义去重和详情响应均经过严格校验。
- 429、5xx、空响应和非法 JSON 最多重试三次。
- 永久失败返回稳定异常，不返回空候选或模拟候选。

### 10.3 数据库与 Pipeline 测试

- 初次生成将真实结果写入候选与字幕表。
- 字幕文本和时间来自 transcript。
- 初次生成失败时项目为 `failed` 且没有候选。
- 重新生成成功时原子替换旧候选。
- 重新生成失败时旧候选保持不变、项目恢复 `ready`。
- `generate_candidates` 和 `regenerate_candidates` 都不调用 ASR。
- 生产代码不存在 mock candidate 路径。

### 10.4 集成与真实验收

自动集成测试使用注入的 DeepSeek 测试客户端，验证完整数据库与任务状态，不消耗真实 API。

最终真实验收必须配置用户提供的 `DEEPSEEK_API_KEY`，使用现有真实 transcript 跑通：

```text
真实 transcript
→ DeepSeek
→ 真实候选入库
→ 项目 ready
→ 项目页展示
```

人工抽查至少三个候选：

- 时间范围属于该 transcript。
- quote 能在原文中找到。
- 标题和摘要没有虚构信息。
- 候选之间没有明显重复。
- 字幕来自真实 transcript。

## 11. 验收标准

Phase 5 只有同时满足以下条件才算完成：

- Worker 生产代码不再包含固定候选生成路径。
- 真实 transcript 可以生成 1–10 个真实候选。
- 评分、边界、标题、摘要、金句和风险提示均通过数据契约校验。
- 字幕和金句可追溯至原始 transcript。
- 初次生成和重新生成具有正确的失败原子性。
- 自动测试、Worker 测试、Web 回归测试、lint 和构建通过。
- 使用真实 DeepSeek key 完成一次端到端验收。

## 12. 明确不做

- 不修复 Phase 4 只处理前 20 分钟的问题；它应作为独立的 Phase 4.1 修复，避免扩大本阶段范围。
- 不实现导出文件。
- 不实现字幕烧录。
- 不做用户可配置的窗口时长或评分参数。
- 不做向量数据库或持久化 embedding。
- 不做账号、权限或多人协作。
- 不把 DeepSeek key 暴露给 Next.js 客户端。

## 13. 参考

- 项目总设计：`docs/superpowers/specs/2026-06-22-clipwise-mvp-design.md`
- 产品规格：`references/直播回放智能切片工具_SPEC_v0.2.md`
- 算法参考：`work/ai-highlight-clip-reference/`
- DeepSeek 官方文档：
  - `https://api-docs.deepseek.com/`
  - `https://api-docs.deepseek.com/guides/json_mode`
  - `https://api-docs.deepseek.com/api/create-chat-completion`
