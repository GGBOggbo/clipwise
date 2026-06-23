from clipwise_worker.config import WorkerConfig


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
