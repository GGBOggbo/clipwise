import pytest
from unittest.mock import MagicMock, patch
from clipwise_worker.asr import GroqTranscriber


@pytest.fixture
def mock_groq_response():
    """模拟 Groq verbose_json 返回结构"""
    return MagicMock(
        segments=[
            MagicMock(
                id=0,
                start=0.0,
                end=5.2,
                text="大家好，今天聊聊AI。",
                words=[
                    MagicMock(word="大家好", start=0.0, end=1.5, probability=0.9),
                    MagicMock(word="今天", start=1.5, end=2.0, probability=0.9),
                    MagicMock(word="聊聊", start=2.0, end=2.5, probability=0.9),
                    MagicMock(word="AI", start=2.5, end=3.0, probability=0.9),
                ],
            )
        ],
        text="大家好，今天聊聊AI。",
        language="zh",
        duration=5.2,
    )


def test_transcribe_chunk_returns_segments(tmp_path, mock_groq_response):
    """单块调用返回标准化的 segment 列表"""
    audio_file = tmp_path / "chunk_0.mp3"
    audio_file.write_bytes(b"fake mp3")

    transcriber = GroqTranscriber(api_key="fake", model="whisper-large-v3")
    with patch.object(transcriber, "_client") as mock_client:
        mock_client.audio.transcriptions.create.return_value = mock_groq_response
        segments = transcriber.transcribe_file(str(audio_file))

    assert len(segments) == 1
    seg = segments[0]
    assert seg["start"] == 0.0
    assert seg["end"] == 5.2
    assert seg["text"] == "大家好，今天聊聊AI。"
    assert len(seg["words"]) == 4
    assert seg["words"][0] == {"word": "大家好", "start": 0.0, "end": 1.5}


def test_transcribe_chunk_normalizes_to_dicts(tmp_path, mock_groq_response):
    """返回的是纯 dict（不是 MagicMock），方便后续 JSON 序列化"""
    audio_file = tmp_path / "chunk.mp3"
    audio_file.write_bytes(b"x")
    transcriber = GroqTranscriber(api_key="fake", model="whisper-large-v3")
    with patch.object(transcriber, "_client") as mock_client:
        mock_client.audio.transcriptions.create.return_value = mock_groq_response
        segments = transcriber.transcribe_file(str(audio_file))
    assert isinstance(segments[0], dict)
    assert isinstance(segments[0]["words"][0], dict)


def test_transcribe_chunk_handles_empty_words(tmp_path):
    """某些 segment 可能没有 words（Groq 偶尔不返回）"""
    empty_response = MagicMock(
        segments=[
            MagicMock(id=0, start=0.0, end=3.0, text="无词时间戳的段", words=[]),
        ],
        text="无词时间戳的段",
        language="zh",
        duration=3.0,
    )
    audio_file = tmp_path / "chunk.mp3"
    audio_file.write_bytes(b"x")
    transcriber = GroqTranscriber(api_key="fake")
    with patch.object(transcriber, "_client") as mock_client:
        mock_client.audio.transcriptions.create.return_value = empty_response
        segments = transcriber.transcribe_file(str(audio_file))
    assert segments[0]["words"] == []
