import pytest
from clipwise_worker.asr import merge_segments_with_offset


def test_merge_adds_offset_to_second_chunk():
    """第二块的时间戳要加上 start_offset_seconds"""
    chunk0 = [
        {"id": 0, "start": 0.0, "end": 5.0, "text": "第一句", "words": [
            {"word": "第一句", "start": 0.0, "end": 5.0}
        ]}
    ]
    chunk1 = [
        {"id": 0, "start": 0.5, "end": 10.0, "text": "第二句", "words": [
            {"word": "第二句", "start": 0.5, "end": 10.0}
        ]}
    ]
    # chunk1 从第 30 分钟（1800 秒）开始，overlap 0.5 秒
    merged = merge_segments_with_offset(
        chunks=[(chunk0, 0.0), (chunk1, 1799.5)],
        overlap_seconds=0.5,
    )
    # 第二块的时间戳要加 1799.5
    assert merged[1]["start"] == pytest.approx(1800.0)
    assert merged[1]["words"][0]["start"] == pytest.approx(1800.0)


def test_merge_dedupes_overlap_words():
    """重叠区的重复 word 要去掉"""
    # chunk0 结尾有个词在 1799.8 秒
    chunk0 = [
        {"id": 0, "start": 1795.0, "end": 1800.0, "text": "结尾词",
         "words": [{"word": "结尾词", "start": 1799.8, "end": 1800.0}]}
    ]
    # chunk1 从 1799.5 开始（overlap 0.5 秒），开头也有同一个词
    chunk1 = [
        {"id": 0, "start": 1799.5, "end": 1805.0, "text": "结尾词 第二句",
         "words": [
             {"word": "结尾词", "start": 0.3, "end": 0.5},  # 加偏移后 1799.8
             {"word": "第二句", "start": 1.0, "end": 2.0},   # 加偏移后 1800.5
         ]}
    ]
    merged = merge_segments_with_offset(
        chunks=[(chunk0, 0.0), (chunk1, 1799.5)],
        overlap_seconds=0.5,
    )
    all_words = [w for seg in merged for w in seg["words"]]
    # "结尾词" 只应出现一次（去重）
    jiewei_count = sum(1 for w in all_words if w["word"] == "结尾词")
    assert jiewei_count == 1
    # "第二句" 应保留
    assert any(w["word"] == "第二句" for w in all_words)


def test_merge_preserves_segment_order():
    """合并后 segment 按 start 升序"""
    chunk0 = [{"id": 0, "start": 0.0, "end": 1.0, "text": "a", "words": []}]
    chunk1 = [{"id": 0, "start": 0.0, "end": 1.0, "text": "b", "words": []}]
    merged = merge_segments_with_offset(
        chunks=[(chunk0, 0.0), (chunk1, 1800.0)],
        overlap_seconds=0.0,
    )
    starts = [seg["start"] for seg in merged]
    assert starts == sorted(starts)


def test_merge_single_chunk_no_offset():
    """单块无需偏移，原样返回"""
    chunk0 = [
        {"id": 0, "start": 0.0, "end": 5.0, "text": "hello", "words": [
            {"word": "hello", "start": 0.0, "end": 5.0}
        ]}
    ]
    merged = merge_segments_with_offset(chunks=[(chunk0, 0.0)])
    assert len(merged) == 1
    assert merged[0]["start"] == 0.0
    assert merged[0]["words"][0]["word"] == "hello"


def test_merge_dedup_window_30_seconds():
    """真实场景：30 秒 overlap 窗口内的重复词去重"""
    # chunk0 结尾 30 秒内的词
    chunk0 = [
        {"id": 0, "start": 1770.0, "end": 1800.0, "text": "最后这段话",
         "words": [
             {"word": "最后", "start": 1771.0, "end": 1772.0},
             {"word": "这段话", "start": 1772.5, "end": 1774.0},
         ]}
    ]
    # chunk1 从 1770 开始（overlap 30 秒），开头重复了"最后这段话"
    chunk1 = [
        {"id": 0, "start": 0.0, "end": 10.0, "text": "最后这段话 新内容",
         "words": [
             {"word": "最后", "start": 1.0, "end": 2.0},      # 加偏移后 1771.0（重复）
             {"word": "这段话", "start": 2.5, "end": 4.0},     # 加偏移后 1772.5（重复）
             {"word": "新内容", "start": 5.0, "end": 6.0},     # 加偏移后 1775.0（新）
         ]}
    ]
    merged = merge_segments_with_offset(
        chunks=[(chunk0, 0.0), (chunk1, 1770.0)],
        overlap_seconds=30.0,
    )
    all_words = [w for seg in merged for w in seg["words"]]
    # "最后" 只出现一次
    assert sum(1 for w in all_words if w["word"] == "最后") == 1
    # "新内容" 保留
    assert any(w["word"] == "新内容" for w in all_words)
