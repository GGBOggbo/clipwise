# Clipwise Python Worker

轮询 Postgres `jobs` 表领取任务，串行执行 ASR / 候选生成 / 字幕烧录。

## 启动

```bash
cd services/worker
uv sync            # 或 pip install -e ".[dev]"
cp .env.example .env  # 改成你的 DATABASE_URL
uv run python -m clipwise_worker.main
```

## 测试

```bash
uv run pytest -v
```

## 当前阶段（Phase 2）

用模拟数据生成候选，不调用真实 Groq/DeepSeek。Phase 4/5 接通真实 AI。
