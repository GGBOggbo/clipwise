# Clipwise Python Worker

轮询 Postgres `jobs` 表领取任务，串行执行 ASR / 候选生成 / 字幕烧录。

当前 Worker 的 AI 分工：

- Groq `whisper-large-v3`：真实 ASR，写入 `transcript_segments`。
- DeepSeek Beta strict tool calling：真实高光候选发现，输出会经过 strict schema、Pydantic 和业务不变量校验。
- 生产路径没有 mock candidate 回退；DeepSeek 缺 key、响应非法或校验失败时，候选任务会失败并记录稳定错误码。

## 启动

```bash
cd services/worker
uv sync            # 或 pip install -e ".[dev]"
cp .env.example .env
uv run python -m clipwise_worker.main
```

必需环境变量：

```bash
DATABASE_URL=postgres://clipwise:clipwise_dev@localhost:5432/clipwise
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...
DEEPSEEK_API_BASE=https://api.deepseek.com/beta
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_OUTPUT_MODE=strict_tool
```

`DEEPSEEK_API_KEY` 只在候选生成任务执行时强制校验；这允许只跑 ASR 任务的本地环境先启动 Worker。

## 测试

```bash
uv run pytest -v
```

本机代理变量可能影响 OpenAI/Groq SDK 的 httpx 初始化；Worker 测试建议使用：

```bash
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest -q
```

## 候选生成约束

- transcript 是唯一真源：候选边界、字幕和 quote 都必须来自 `transcript_segments`。
- DeepSeek 只返回结构化决策，不允许编造字幕或凭空生成片段。
- 本地业务层会过滤 60 分以下窗口、去除超过 80% 时间重叠的窗口，并最多写入 10 条候选。
- 初次候选生成失败：项目进入 `failed`，不会写入假候选。
- 重新生成失败：保留旧候选，项目恢复 `ready`。
