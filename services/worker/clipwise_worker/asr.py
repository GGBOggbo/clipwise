from __future__ import annotations

from typing import Any
from groq import Groq


class GroqTranscriber:
    """封装 Groq Whisper 调用，返回标准化的 segment 列表。"""

    def __init__(self, api_key: str, model: str = "whisper-large-v3") -> None:
        self._client = Groq(api_key=api_key)
        self._model = model

    def transcribe_file(self, audio_path: str) -> list[dict[str, Any]]:
        """转写单个音频文件，返回 segments（每段含 words）。

        Args:
            audio_path: 音频文件路径（mp3/wav/m4a/mp4 等）

        Returns:
            [{id, start, end, text, words:[{word, start, end}]}, ...]
            start/end 单位是秒；words 可能是空列表（Groq 偶尔不返回词级时间戳）
        """
        with open(audio_path, "rb") as f:
            response = self._client.audio.transcriptions.create(
                model=self._model,
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["word", "segment"],
                language="zh",
                temperature=0.0,
            )

        segments: list[dict[str, Any]] = []
        for seg in response.segments:
            raw_words = getattr(seg, "words", None) or []
            words = [
                {"word": w.word, "start": w.start, "end": w.end}
                for w in raw_words
            ]
            segments.append(
                {
                    "id": seg.id,
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text.strip(),
                    "words": words,
                }
            )
        return segments
