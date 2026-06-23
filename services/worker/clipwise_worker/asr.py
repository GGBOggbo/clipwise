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


def merge_segments_with_offset(
    chunks: list[tuple[list[dict[str, Any]], float]],
    overlap_seconds: float = 30.0,
) -> list[dict[str, Any]]:
    """合并多块转写结果，加全局偏移，去重 overlap 区。

    Args:
        chunks: [(segments, start_offset_seconds), ...] 按块顺序。
            segments 是 GroqTranscriber.transcribe_file 的返回；
            start_offset_seconds 是该块在整个音频中的起始秒。
        overlap_seconds: 相邻块的重叠秒数，用于去重窗口（默认 30s）。

    Returns:
        合并后的 segments 列表，按 start 升序。
        每段 {start, end, text, words:[{word, start, end}]}，words 已去重。
        时间单位是秒。
    """
    # 容差：两个 word 的 start 差距小于此值视为同一词（去重）
    dedup_tolerance_seconds = 0.3
    seen_word_starts: list[float] = []
    merged: list[dict[str, Any]] = []

    for segments, offset in chunks:
        for seg in segments:
            new_words = []
            for w in seg["words"]:
                adjusted_start = round(w["start"] + offset, 3)
                # 去重：如果这个词的开始时间与已记录的某个词接近，跳过
                is_duplicate = any(
                    abs(adjusted_start - s) < dedup_tolerance_seconds
                    for s in seen_word_starts
                )
                if is_duplicate:
                    continue
                seen_word_starts.append(adjusted_start)
                new_words.append(
                    {
                        "word": w["word"],
                        "start": adjusted_start,
                        "end": round(w["end"] + offset, 3),
                    }
                )
            merged.append(
                {
                    "start": round(seg["start"] + offset, 3),
                    "end": round(seg["end"] + offset, 3),
                    "text": seg["text"],
                    "words": new_words,
                }
            )

    merged.sort(key=lambda s: s["start"])
    return merged
