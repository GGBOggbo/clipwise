# Clipwise Phase 5 DeepSeek 高光发现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将真实 `transcript_segments` 通过 DeepSeek strict function calling 转换为 1–10 个可溯源的真实候选，彻底删除 Worker 的固定 mock 候选生产路径。

**Architecture:** Python Worker 新增独立的领域模型、窗口算法、DeepSeek strict 客户端、候选编排和持久化模块。模型输出经过 DeepSeek strict schema、Pydantic 和业务不变量三层校验，整套候选在内存完成后通过单一数据库事务替换；初次生成失败标记项目失败，重新生成失败保留旧候选并恢复项目 ready。

**Tech Stack:** Python 3.12+、asyncpg、OpenAI Python SDK、Pydantic 2、DeepSeek Beta strict function calling、pytest/pytest-asyncio、PostgreSQL、Next.js 16/Vitest/Playwright 回归验证。

---

## 一、文件结构

### 新建

- `services/worker/clipwise_worker/highlight_models.py`
  - transcript、窗口、评分、边界决策、详情和最终候选的 Pydantic/领域模型。
- `services/worker/clipwise_worker/highlight_windows.py`
  - 确定性滑动窗口、排序、质量过滤、时间重叠去重、边界映射和 quote 溯源纯函数。
- `services/worker/clipwise_worker/deepseek.py`
  - strict tool schema、OpenAI SDK 请求、tool call 解析、Pydantic 校验和三次重试。
- `services/worker/clipwise_worker/highlight_pipeline.py`
  - 读取 transcript、调用三阶段模型、组装真实字幕和最终候选。
- `services/worker/clipwise_worker/candidates.py`
  - 候选事务写入、项目失败/恢复状态。
- `services/worker/tests/test_highlight_windows.py`
- `services/worker/tests/test_deepseek_contracts.py`
- `services/worker/tests/test_deepseek_client.py`
- `services/worker/tests/test_highlight_pipeline.py`
- `services/worker/tests/test_candidate_persistence.py`
- `services/worker/tests/test_pipeline_candidates.py`
- `apps/web/tests/integration/real-deepseek-candidates.test.ts`
- `docs/phase-5-verification.md`

### 修改

- `.env.example`
  - 将 DeepSeek 配置注释更新为 Phase 5 已接通，默认 base URL 改为 Beta endpoint，增加输出模式。
- `services/worker/.env.example`
  - 增加 Worker 所需 DeepSeek 配置。
- `services/worker/pyproject.toml`
  - 增加 `openai` 和 `pydantic`。
- `services/worker/uv.lock`
  - 锁定新增依赖。
- `services/worker/clipwise_worker/config.py`
  - 增加 DeepSeek 配置并允许 ASR-only/候选任务启动时明确校验对应 key。
- `services/worker/clipwise_worker/pipeline.py`
  - 注入候选生成服务，删除 `mock_ai` 导入，接入真实进度和失败状态。
- `services/worker/tests/conftest.py`
  - 扩展测试配置和共享 transcript fixture。
- `services/worker/tests/test_pipeline.py`
  - 从 mock candidate 断言改为注入真实候选服务的编排行为。
- `services/worker/tests/test_mock_ai.py`
  - 删除。
- `services/worker/README.md`
  - 更新为 Phase 5 真实 Groq + DeepSeek Worker。
- `apps/web/tests/integration/create-to-ready.test.ts`
  - 不再上传无效三字节音频并断言固定七个候选；改为可控测试候选服务或限定为 live DeepSeek 集成测试。
- `apps/web/tests/integration/sse-flow.test.ts`
  - 不再依赖固定七候选。
- `apps/web/tests/integration/real-upload-asr.test.ts`
  - 候选断言改为 1–10 个真实结果并检查溯源字段。
- `task_plan.md`
- `findings.md`
- `progress.md`

### 删除

- `services/worker/clipwise_worker/mock_ai.py`
- `services/worker/tests/test_mock_ai.py`

---

## 二、任务清单

### Task 1：依赖与 Worker 配置

**Files:**
- Modify: `services/worker/pyproject.toml`
- Modify: `services/worker/clipwise_worker/config.py`
- Modify: `services/worker/.env.example`
- Modify: `.env.example`
- Test: `services/worker/tests/test_db.py`
- Test: `services/worker/tests/test_deepseek_client.py`

- [ ] **Step 1: 写失败测试——环境变量映射为 DeepSeek 配置**

在 `services/worker/tests/test_deepseek_client.py` 写：

```python
def test_worker_config_reads_deepseek_settings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://example")
    monkeypatch.setenv("GROQ_API_KEY", "groq-key")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "deepseek-key")
    monkeypatch.setenv("DEEPSEEK_API_BASE", "https://api.deepseek.com/beta")
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    monkeypatch.setenv("DEEPSEEK_OUTPUT_MODE", "strict_tool")

    config = WorkerConfig.from_env()

    assert config.deepseek_api_key == "deepseek-key"
    assert config.deepseek_api_base == "https://api.deepseek.com/beta"
    assert config.deepseek_model == "deepseek-v4-flash"
    assert config.deepseek_output_mode == "strict_tool"
```

- [ ] **Step 2: 运行测试，确认因字段不存在而失败**

Run:

```bash
cd services/worker
uv run pytest tests/test_deepseek_client.py::test_worker_config_reads_deepseek_settings -v
```

Expected: FAIL，`WorkerConfig` 不接受或没有 `deepseek_*` 字段。

- [ ] **Step 3: 增加依赖和配置字段**

`pyproject.toml` dependencies 增加：

```toml
"openai>=1.68",
"pydantic>=2.10",
```

`WorkerConfig` 增加：

```python
deepseek_api_key: str
deepseek_api_base: str = "https://api.deepseek.com/beta"
deepseek_model: str = "deepseek-v4-flash"
deepseek_output_mode: str = "strict_tool"
```

`from_env()` 读取四个变量；`DEEPSEEK_API_KEY` 缺失时保存为空字符串，不在 Worker 启动时阻止纯 ASR 任务，候选任务执行时再返回稳定错误码。

- [ ] **Step 4: 更新 env 示例并同步 lock**

Run:

```bash
cd services/worker
uv lock
```

`.env.example` 和 `services/worker/.env.example` 使用：

```bash
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE=https://api.deepseek.com/beta
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_OUTPUT_MODE=strict_tool
```

- [ ] **Step 5: 运行测试**

Run:

```bash
cd services/worker
uv run pytest tests/test_deepseek_client.py::test_worker_config_reads_deepseek_settings -v
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add .env.example services/worker/.env.example services/worker/pyproject.toml \
  services/worker/uv.lock services/worker/clipwise_worker/config.py \
  services/worker/tests/test_deepseek_client.py
git commit -m "chore: add deepseek worker configuration"
```

### Task 2：领域模型与 strict schema

**Files:**
- Create: `services/worker/clipwise_worker/highlight_models.py`
- Create: `services/worker/tests/test_deepseek_contracts.py`

- [ ] **Step 1: 写失败测试——Pydantic 禁止额外字段和非法枚举**

测试至少包含：

```python
def test_score_response_rejects_extra_fields():
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate({
            "items": [{
                "windowId": "window-0001",
                "finalScore": 80,
                "type": "方法",
                "recommendationReason": "完整方法",
                "unexpected": True,
            }]
        })


def test_score_response_rejects_invalid_type():
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate({
            "items": [{
                "windowId": "window-0001",
                "finalScore": 80,
                "type": "闲聊",
                "recommendationReason": "不合法类型",
            }]
        })
```

- [ ] **Step 2: 运行测试，确认模块不存在**

Run:

```bash
cd services/worker
uv run pytest tests/test_deepseek_contracts.py -v
```

Expected: FAIL with `ModuleNotFoundError`。

- [ ] **Step 3: 实现严格领域模型**

定义：

```python
class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


ClipType = Literal["观点", "方法", "案例", "避坑", "对比", "总结", "金句"]

class TranscriptSegment(StrictModel):
    id: str
    index: int
    start_ms: int
    end_ms: int
    text: str

class CandidateWindow(StrictModel):
    window_id: str
    start_ms: int
    end_ms: int
    segment_ids: list[str]
    text: str

class WindowScore(StrictModel):
    windowId: str
    finalScore: int = Field(ge=0, le=100)
    type: ClipType
    recommendationReason: str

class ScoreBatchResponse(StrictModel):
    items: list[WindowScore]

class BoundaryDecision(StrictModel):
    windowId: str
    keep: bool
    duplicateOf: str | None
    startSegmentId: str
    endSegmentId: str

class SelectionResponse(StrictModel):
    items: list[BoundaryDecision]

class CandidateDetail(StrictModel):
    windowId: str
    titleOptions: list[str]
    summary: str
    quote: str
    riskNotices: list[str]

    @field_validator("titleOptions")
    @classmethod
    def require_three_titles(cls, value: list[str]) -> list[str]:
        if len(value) != 3 or any(not title.strip() for title in value):
            raise ValueError("titleOptions must contain three non-empty titles")
        return value

class DetailBatchResponse(StrictModel):
    items: list[CandidateDetail]
```

另外定义 `ScoredWindow`、`FinalCandidateInput` 和 `FinalCandidate` 供业务层使用，字段全部使用 snake_case。

- [ ] **Step 4: 写失败测试——生成的 strict schema 满足 DeepSeek 约束**

测试递归检查每个 object：

```python
def assert_deepseek_strict_object(schema):
    if schema.get("type") == "object":
        assert schema.get("additionalProperties") is False
        assert set(schema.get("required", [])) == set(schema.get("properties", {}))
    for child in schema.get("properties", {}).values():
        assert_deepseek_strict_object(child)
    if "items" in schema:
        assert_deepseek_strict_object(schema["items"])
    for child in schema.get("$defs", {}).values():
        assert_deepseek_strict_object(child)
```

- [ ] **Step 5: 实现 schema 清理函数**

实现 `build_strict_tool_schema(model, name, description)`：

- 使用 `model.model_json_schema()`
- 保留 DeepSeek strict 支持的类型和约束
- 所有 object 强制 `additionalProperties: false`
- 所有 properties 全部列入 required
- 将可空字段保留为 `anyOf`
- 不生成 `minLength`、`maxLength`、`minItems`、`maxItems`

返回：

```python
{
    "type": "function",
    "function": {
        "name": name,
        "description": description,
        "strict": True,
        "parameters": schema,
    },
}
```

- [ ] **Step 6: 运行 contracts 测试**

Run:

```bash
cd services/worker
uv run pytest tests/test_deepseek_contracts.py -v
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add services/worker/clipwise_worker/highlight_models.py \
  services/worker/tests/test_deepseek_contracts.py
git commit -m "feat: add strict highlight data contracts"
```

### Task 3：滑动窗口与确定性筛选

**Files:**
- Create: `services/worker/clipwise_worker/highlight_windows.py`
- Create: `services/worker/tests/test_highlight_windows.py`

- [ ] **Step 1: 写失败测试——窗口对齐 segment 且遵守时长**

用每条 15 秒的 transcript fixture，断言：

```python
windows = generate_candidate_windows(
    segments,
    target_ms=90_000,
    min_ms=45_000,
    max_ms=150_000,
    step_ms=45_000,
)

assert windows[0].start_ms == segments[0].start_ms
assert windows[0].end_ms == segments[5].end_ms
assert windows[0].segment_ids == [s.id for s in segments[:6]]
assert all(45_000 <= w.end_ms - w.start_ms <= 150_000 for w in windows)
```

增加空 transcript、尾部不足 45 秒、存在 segment 间隙和最后一个完整窗口测试。

- [ ] **Step 2: 运行测试，确认函数不存在**

Run:

```bash
cd services/worker
uv run pytest tests/test_highlight_windows.py -v
```

Expected: FAIL。

- [ ] **Step 3: 实现窗口算法**

规则：

- transcript 先按 `(index, start_ms)` 排序。
- 每个窗口起点只能取 segment 起点。
- 从起点向后累积，选择第一个达到目标 90 秒的完整 segment 作为终点。
- 如果达到目标前超过 150 秒，使用上一个不超过 150 秒的 segment。
- 实际时长不足 45 秒则不生成。
- 下一个窗口选择首个 `start_ms >= current_start + 45_000` 的 segment。
- ID 为 `window-{ordinal:04d}`。

- [ ] **Step 4: 写失败测试——排序、60 分阈值和 80% 重叠**

覆盖：

```python
selected = select_time_unique_windows(scored, min_score=60, max_candidates=30)
assert [item.window.window_id for item in selected] == [
    "window-highest",
    "window-non-overlap",
]
```

重叠比例定义为：

```python
overlap_ms / min(duration_a, duration_b)
```

比例 `> 0.8` 才视为重复，恰好 `0.8` 保留。

- [ ] **Step 5: 实现确定性筛选**

实现 `overlap_ratio(a, b) -> float` 和
`select_time_unique_windows(items, min_score=60, max_candidates=30) -> list[ScoredWindow]`。

排序键为 `(-final_score, start_ms, window_id)`。

- [ ] **Step 6: 写失败测试——边界映射和 quote 溯源**

覆盖：

- 开始/结束 segment 不存在。
- start 排在 end 后面。
- 调整后短于 45 秒或长于 150 秒。
- 边界越出原窗口 segment 范围。
- quote 仅忽略普通空白后可找到。
- 改动标点或汉字时不可找到。

- [ ] **Step 7: 实现边界和 quote 校验**

实现：

```python
def normalize_plain_whitespace(value: str) -> str:
    return re.sub(r"[ \t\r\n\u3000]+", "", value)


def quote_is_verbatim(quote: str, transcript_text: str) -> bool:
    normalized_quote = normalize_plain_whitespace(quote)
    normalized_transcript = normalize_plain_whitespace(transcript_text)
    return bool(normalized_quote) and normalized_quote in normalized_transcript
```

同时实现
`apply_boundary_decision(scored, decision, segments_by_id) -> FinalCandidateInput`，
按测试规定验证 ID、顺序、原窗口范围和 45–150 秒时长。

- [ ] **Step 8: 运行纯函数测试**

Run:

```bash
cd services/worker
uv run pytest tests/test_highlight_windows.py -v
```

Expected: PASS。

- [ ] **Step 9: 提交**

```bash
git add services/worker/clipwise_worker/highlight_windows.py \
  services/worker/tests/test_highlight_windows.py
git commit -m "feat: add deterministic highlight window selection"
```

### Task 4：DeepSeek strict 客户端

**Files:**
- Create: `services/worker/clipwise_worker/deepseek.py`
- Modify: `services/worker/tests/test_deepseek_client.py`

- [ ] **Step 1: 写失败测试——强制指定 strict tool**

注入一个记录参数的假 `chat.completions.create`，断言：

```python
assert kwargs["model"] == "deepseek-v4-flash"
assert kwargs["extra_body"] == {"thinking": {"type": "disabled"}}
assert kwargs["tools"][0]["function"]["strict"] is True
assert kwargs["tool_choice"] == {
    "type": "function",
    "function": {"name": "submit_window_scores"},
}
assert kwargs["temperature"] == 0
```

- [ ] **Step 2: 运行测试，确认客户端不存在**

Run:

```bash
cd services/worker
uv run pytest tests/test_deepseek_client.py -v
```

Expected: FAIL。

- [ ] **Step 3: 实现请求骨架和依赖注入**

```python
class DeepSeekError(RuntimeError):
    code: str
    retryable: bool

class DeepSeekClient:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        sdk_client=None,
        sleeper=time.sleep,
    ):
        if not api_key:
            raise DeepSeekError("missing_deepseek_key", retryable=False)
        self._client = sdk_client or OpenAI(api_key=api_key, base_url=base_url)
        self._model = model
        self._sleeper = sleeper
```

默认 SDK：

```python
OpenAI(api_key=api_key, base_url=base_url)
```

内部 `_call_strict_tool()` 负责构造单个指定 tool 请求。

- [ ] **Step 4: 写失败测试——拒绝错误 completion 形态**

分别测试：

- `finish_reason != "tool_calls"`
- `tool_calls` 为空
- 多于一个 tool call
- function name 不匹配
- arguments 非 JSON
- Pydantic 校验失败

均应抛 `DeepSeekError(code="deepseek_invalid_response", retryable=True)`。

- [ ] **Step 5: 实现 tool call 解析**

成功条件：

```python
choice = response.choices[0]
choice.finish_reason == "tool_calls"
len(choice.message.tool_calls) == 1
tool.type == "function"
tool.function.name == expected_name
response_model.model_validate_json(tool.function.arguments)
```

- [ ] **Step 6: 写失败测试——最多三次且只重试可恢复错误**

覆盖：

- 前两次 429、第三次成功，sleeper 收到 `[1, 2]`。
- 连续三次 5xx，最终抛 `deepseek_request_failed`。
- schema 400 立即失败，不重试。
- invalid response 连续三次，最终抛 `deepseek_invalid_response`。

- [ ] **Step 7: 实现重试分类**

使用 OpenAI SDK 异常类型和 HTTP status：

- 429、408、5xx：retryable。
- tool/JSON/Pydantic 响应错误：retryable。
- 400 且信息指向 schema 不支持：non-retryable。
- 401/403：non-retryable。

最多三次调用，调用间隔 1 秒、2 秒。

- [ ] **Step 8: 实现三个公开方法与提示词**

```python
score_windows(windows) -> list[WindowScore]
select_unique_candidates(candidates) -> list[BoundaryDecision]
generate_candidate_details(candidates) -> list[CandidateDetail]
```

每个方法：

- 按设计批次大小分组。
- 输入只包含必要字段。
- system prompt 写清评分/去重/原文金句规则。
- 返回前验证输入 ID 集合与输出 ID 集合完全一致。
- score 批次成功后不因后续批次失败而重复发送。

- [ ] **Step 9: 运行客户端和契约测试**

Run:

```bash
cd services/worker
uv run pytest tests/test_deepseek_contracts.py tests/test_deepseek_client.py -v
```

Expected: PASS。

- [ ] **Step 10: 提交**

```bash
git add services/worker/clipwise_worker/deepseek.py \
  services/worker/tests/test_deepseek_client.py
git commit -m "feat: add strict deepseek client"
```

### Task 5：候选业务编排

**Files:**
- Create: `services/worker/clipwise_worker/highlight_pipeline.py`
- Create: `services/worker/tests/test_highlight_pipeline.py`
- Modify: `services/worker/tests/conftest.py`

- [ ] **Step 1: 写失败测试——完整三阶段顺序**

创建 `RecordingDeepSeekClient`，返回由 transcript 推导的受控结果，断言调用顺序：

```python
assert client.calls == ["score", "select", "details"]
```

最终候选断言：

```python
assert 1 <= len(result) <= 10
assert result[0].rank == 1
assert result[0].selected_title == result[0].title_options[0]
assert result[0].subtitles[0].text == transcript[0].text
```

- [ ] **Step 2: 运行测试，确认服务不存在**

Run:

```bash
cd services/worker
uv run pytest tests/test_highlight_pipeline.py -v
```

Expected: FAIL。

- [ ] **Step 3: 实现 transcript repository 读取**

```python
async def read_transcript(database, project_token) -> list[TranscriptSegment]:
    SELECT id, index, start_ms, end_ms, text
    FROM transcript_segments
    WHERE project_token = $1
    ORDER BY index ASC, start_ms ASC
```

- [ ] **Step 4: 实现 `HighlightPipeline.generate()`**

顺序：

1. transcript 为空抛 `HighlightGenerationError("no_transcript")`。
2. 生成窗口；为空抛 `no_quality_candidates`。
3. 分批评分。
4. 本地 60 分过滤和 80% 时间去重。
5. 最多取 30 个进行语义去重和边界选择。
6. 验证每个 `keep=false` 的 `duplicateOf` 指向保留且分数不低的候选。
7. 映射真实边界。
8. 最多取前 10 个生成详情。
9. 校验标题非空且恰好 3 个、summary 非空、quote 原文可追溯。
10. 从最终范围内 transcript 复制字幕。
11. 按分数排序并生成连续 rank。

- [ ] **Step 5: 写失败测试——无候选绝不回退**

覆盖：

- 无 transcript。
- 全部低于 60。
- DeepSeek 永久失败。
- quote 非原文。

均断言抛稳定错误，结果不是空成功，也不出现 fixture 标题。

- [ ] **Step 6: 实现稳定错误映射**

```python
class HighlightGenerationError(RuntimeError):
    def __init__(self, code: str, user_message: str):
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message
```

映射设计文档中的错误码。

- [ ] **Step 7: 运行业务编排测试**

Run:

```bash
cd services/worker
uv run pytest tests/test_highlight_pipeline.py -v
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add services/worker/clipwise_worker/highlight_pipeline.py \
  services/worker/tests/test_highlight_pipeline.py \
  services/worker/tests/conftest.py
git commit -m "feat: build real highlight generation pipeline"
```

### Task 6：事务持久化与失败原子性

**Files:**
- Create: `services/worker/clipwise_worker/candidates.py`
- Create: `services/worker/tests/test_candidate_persistence.py`

- [ ] **Step 1: 写失败测试——真实候选和字幕原子写入**

准备项目、transcript 和两个最终候选，调用：

```python
await replace_project_candidates(db, project_token, candidates)
```

断言：

- 候选 2 条。
- 字幕内容和时间与 transcript 一致。
- rank 为 1、2。
- project 为 ready。

- [ ] **Step 2: 运行测试，确认函数不存在**

Run:

```bash
cd services/worker
uv run pytest tests/test_candidate_persistence.py -v
```

Expected: FAIL。

- [ ] **Step 3: 实现单事务替换**

在一个 `conn.transaction()` 中先删除该项目旧候选，再使用固定 SQL 列表逐条插入设计文档定义的全部候选和字幕字段，最后执行：

```sql
UPDATE projects SET status='ready', updated_at=NOW() WHERE token=$1;
```

不得使用动态列名、部分字段写入或事务外插入。

候选 ID 为 `f"{project_token}-{uuid.uuid4()}"`，字幕 ID 使用 UUID。

- [ ] **Step 4: 写失败测试——中途写入异常回滚**

通过注入或 monkeypatch 让第二条字幕插入失败，断言：

- 旧候选仍存在。
- 没有半套新候选。
- project 状态未被错误改为 ready。

- [ ] **Step 5: 实现项目失败/恢复函数**

```python
async def mark_initial_generation_failed(db, project_token):  # status=failed
async def restore_after_regeneration_failure(db, project_token):  # status=ready
```

- [ ] **Step 6: 运行持久化测试**

Run:

```bash
cd services/worker
uv run pytest tests/test_candidate_persistence.py -v
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add services/worker/clipwise_worker/candidates.py \
  services/worker/tests/test_candidate_persistence.py
git commit -m "feat: persist real candidates atomically"
```

### Task 7：接入 Worker 并删除生产 Mock

**Files:**
- Modify: `services/worker/clipwise_worker/pipeline.py`
- Delete: `services/worker/clipwise_worker/mock_ai.py`
- Modify: `services/worker/tests/test_pipeline.py`
- Create: `services/worker/tests/test_pipeline_candidates.py`
- Delete: `services/worker/tests/test_mock_ai.py`

- [ ] **Step 1: 写失败测试——候选任务调用真实服务**

向 `Pipeline` 注入 `candidate_service_factory`，测试：

```python
task = await repo.claim_next()
await pipeline.process_task(task)

assert service.generate_calls == [project_token]
assert job.status == "succeeded"
assert project.status == "ready"
```

- [ ] **Step 2: 写失败测试——初次失败与重新生成失败状态不同**

初次生成：

```python
assert job.error_code == "deepseek_invalid_response"
assert project.status == "failed"
assert candidate_count == 0
```

重新生成：

```python
assert job.error_code == "deepseek_invalid_response"
assert project.status == "ready"
assert old_candidates_unchanged
```

- [ ] **Step 3: 运行测试，确认当前 mock 路径不满足**

Run:

```bash
cd services/worker
uv run pytest tests/test_pipeline_candidates.py -v
```

Expected: FAIL。

- [ ] **Step 4: 重构 Pipeline 候选分支**

`Pipeline.__init__` 增加可选：

```python
candidate_service_factory: Callable[[WorkerConfig], HighlightPipeline] | None
```

默认 factory：

- key 为空时抛 `missing_deepseek_key`。
- 构造 `DeepSeekClient` 和 `HighlightPipeline`。

候选任务：

1. 更新真实阶段进度。
2. 调用 `generate(project_token, progress_callback)`。
3. 调用事务替换。
4. mark succeeded。
5. 捕获 `HighlightGenerationError`，按任务类型更新 project 状态并 mark failed。
6. 捕获数据库错误，使用 `candidate_persist_failed`。

- [ ] **Step 5: 删除 mock 文件和测试**

删除：

```text
services/worker/clipwise_worker/mock_ai.py
services/worker/tests/test_mock_ai.py
```

运行：

```bash
rg -n "generate_mock_candidates|mock_ai|MOCK_CANDIDATES" services/worker/clipwise_worker
```

Expected: 无匹配。

- [ ] **Step 6: 运行 Worker 全量测试**

Run:

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest -q
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add services/worker/clipwise_worker/pipeline.py \
  services/worker/tests/test_pipeline.py \
  services/worker/tests/test_pipeline_candidates.py
git add -u services/worker/clipwise_worker/mock_ai.py \
  services/worker/tests/test_mock_ai.py
git commit -m "feat: replace mock candidates with deepseek pipeline"
```

### Task 8：集成测试去除固定七候选假设

**Files:**
- Modify: `apps/web/tests/integration/create-to-ready.test.ts`
- Modify: `apps/web/tests/integration/sse-flow.test.ts`
- Modify: `apps/web/tests/integration/real-upload-asr.test.ts`
- Create: `apps/web/tests/integration/real-deepseek-candidates.test.ts`

- [ ] **Step 1: 写失败断言——候选必须可溯源且数量为 1–10**

公用断言：

```typescript
expect(clips.length).toBeGreaterThanOrEqual(1);
expect(clips.length).toBeLessThanOrEqual(10);
expect(new Set(clips.map((clip) => clip.id)).size).toBe(clips.length);
expect(clips.every((clip) => clip.subtitles.length > 0)).toBe(true);
```

数据库查询 transcript 后验证每条 subtitle 的时间范围和文本属于该项目 transcript。

- [ ] **Step 2: 运行目标集成测试，确认旧固定七条断言或环境假设失败**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
pnpm --filter @clipwise/web exec vitest run \
  tests/integration/create-to-ready.test.ts \
  tests/integration/sse-flow.test.ts \
  tests/integration/real-upload-asr.test.ts
```

Expected: 至少因固定七候选或未配置测试 DeepSeek 服务而 FAIL。

- [ ] **Step 3: 将普通集成测试与真实外部服务分层**

- `create-to-ready` 和 `sse-flow` 只验证 Web/API/SSE，不上传伪音频触发真实 AI；直接创建受控 job 并由测试数据库更新进度。
- `real-upload-asr` 只验证真实 ASR 和 transcript，不再要求后续 DeepSeek 成功。
- 新 `real-deepseek-candidates` 使用已有 transcript 项目，设置：

```typescript
describe.skipIf(!process.env.RUN_REAL_DEEPSEEK)
```

并等待 `generate_candidates` job 完成。

- [ ] **Step 4: 运行非真实集成和 Web 单测**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
pnpm --filter @clipwise/web exec vitest run \
  --exclude 'tests/integration/real-deepseek-candidates.test.ts' \
  --exclude 'tests/integration/real-upload-asr.test.ts'
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/tests/integration/create-to-ready.test.ts \
  apps/web/tests/integration/sse-flow.test.ts \
  apps/web/tests/integration/real-upload-asr.test.ts \
  apps/web/tests/integration/real-deepseek-candidates.test.ts
git commit -m "test: remove fixed mock candidate assumptions"
```

### Task 9：文档、README 与无 Mock 审计

**Files:**
- Modify: `services/worker/README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Create: `docs/phase-5-verification.md`

- [ ] **Step 1: 更新 Worker README**

明确：

- Groq 负责 ASR。
- DeepSeek strict tool calling 负责候选。
- 需要 `DEEPSEEK_API_KEY`。
- 启动命令。
- 不存在生产 mock 回退。

- [ ] **Step 2: 执行生产路径审计**

Run:

```bash
rg -n "generate_mock_candidates|MOCK_CANDIDATES|mock_ai" \
  services/worker/clipwise_worker apps/web/app apps/web/lib
```

Expected: 0 匹配。

允许的 fixture 仅位于：

```text
packages/shared/src/fixtures.ts
apps/web/db/seed.ts
apps/web/tests/
```

- [ ] **Step 3: 更新规划文件**

记录：

- Phase 5 完成项。
- 真实结构化输出方案。
- 自动测试结果。
- 仍未完成的 Phase 4.1 长视频完整时长和 Phase 6 导出。

- [ ] **Step 4: 创建 Phase 5 验收模板**

`docs/phase-5-verification.md` 包含：

- 自动测试表。
- strict schema 契约。
- 无 mock 审计。
- 真实 DeepSeek 验收项目 token。
- 候选数量。
- 三条人工抽查表。
- 尚未完成边界。

- [ ] **Step 5: 提交**

```bash
git add services/worker/README.md task_plan.md findings.md progress.md \
  docs/phase-5-verification.md
git commit -m "docs: record phase 5 deepseek pipeline"
```

### Task 10：自动验证

**Files:**
- Modify only if verification exposes defects.

- [ ] **Step 1: Worker 测试**

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest -q
```

Expected: 0 failed。

- [ ] **Step 2: Web 单测**

```bash
cd ../..
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
pnpm --filter @clipwise/web exec vitest run --exclude 'tests/integration/**'
```

Expected: 0 failed。

- [ ] **Step 3: E2E**

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
pnpm test:e2e
```

Expected: Chromium + WebKit 全部通过。

- [ ] **Step 4: lint、build、diff**

```bash
pnpm lint
pnpm build
git diff --check
```

Expected: 全部 exit 0；若 build 保留既有 Turbopack storage tracing warning，记录为已知警告，不误报为 Phase 5 新错误。

- [ ] **Step 5: 数据库迁移检查**

Phase 5 不需要 schema migration。运行：

```bash
pnpm db:generate
git status --short apps/web/db/migrations
```

Expected: 不产生新 migration。

### Task 11：真实 DeepSeek 端到端验收

**Files:**
- Modify: `services/worker/.env`（ignored，不提交）
- Modify: `docs/phase-5-verification.md`

- [ ] **Step 1: 用户提供并配置新的 DeepSeek Key**

只写入：

```text
services/worker/.env
```

不得写入 `NEXT_PUBLIC_*`，不得在日志、测试输出或提交中展示 key。

- [ ] **Step 2: 选择现有真实 transcript 项目**

查询：

```sql
SELECT project_token, count(*) AS segment_count,
       min(start_ms) AS first_ms, max(end_ms) AS last_ms
FROM transcript_segments
GROUP BY project_token
ORDER BY segment_count DESC;
```

选取 segment 足够、内容可人工核对的项目。删除该项目旧固定候选后创建一个新的 `generate_candidates` job；保留项目和 transcript。

- [ ] **Step 3: 启动服务并运行真实任务**

```bash
pnpm db:up
pnpm dev
cd services/worker
uv run python -m clipwise_worker.main
```

另一个终端：

```bash
RUN_REAL_DEEPSEEK=1 \
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
pnpm --filter @clipwise/web exec vitest run \
  tests/integration/real-deepseek-candidates.test.ts
```

Expected: job succeeded，project ready，候选数量 1–10。

- [ ] **Step 4: 自动溯源检查**

对所有候选验证：

- start/end 等于其首尾字幕。
- 每条字幕来自同项目 transcript。
- quote 去普通空白后存在于候选 transcript。
- rank 连续。
- finalScore >= 60。
- 候选两两时间重叠不超过较短候选 80%。

- [ ] **Step 5: 浏览器人工抽查**

访问：

```text
http://localhost:3000/project/<token>
```

抽查至少三条候选：

- 标题与片段内容一致。
- 摘要没有额外事实。
- 金句可在字幕中定位。
- 时间边界不截断明显半句话。
- 候选之间无明显语义重复。

- [ ] **Step 6: 写入验收证据并提交**

文档只记录：

- 日期。
- 项目 token 的前 8 位。
- transcript segment 数。
- 候选数。
- 测试和人工抽查结论。
- 不记录 API key 或完整私密 token。

```bash
git add docs/phase-5-verification.md
git commit -m "test: verify real deepseek candidate generation"
```

---

## 三、规格覆盖检查

| 设计要求 | 实施任务 |
|---|---|
| 无生产 mock 和无静默回退 | Task 5、7、9 |
| 90 秒目标、45–150 秒、45 秒步长 | Task 3 |
| 60 分阈值、80% 时间去重、TOP 10 | Task 3、5 |
| DeepSeek Beta strict function calling | Task 2、4 |
| Pydantic + 业务不变量 | Task 2、3、4、5 |
| 三次重试与错误分类 | Task 4 |
| transcript 为边界、quote、字幕真源 | Task 3、5、6 |
| 初次失败无候选且项目 failed | Task 6、7 |
| 重新生成失败保留旧候选 | Task 6、7 |
| 事务替换 | Task 6 |
| 真实 DeepSeek 端到端验收 | Task 11 |

## 四、执行约束

- 每项生产代码必须先有对应失败测试并观察到正确失败。
- 不在 Phase 5 顺手修复长视频只处理前 20 分钟的问题。
- 不实现任何 Phase 6 导出功能。
- 不将真实 key 写入仓库、命令输出或文档。
- 不通过降低校验标准让模型错误响应“勉强可用”。
- 不把 fixture、测试客户端或固定候选导入生产 Worker。
