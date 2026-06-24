import uuid

import pytest

from clipwise_worker.highlight_models import (
    BoundaryDecision,
    CandidateDetail,
    GlobalCalibration,
    ScoredWindow,
    TranscriptSegment,
    WindowScore,
)
from clipwise_worker.deepseek import DeepSeekError
from clipwise_worker.highlight_pipeline import (
    CALIBRATION_MIN_CANDIDATES,
    HighlightGenerationError,
    HighlightPipeline,
)


async def insert_project_with_transcript(db, *, segment_count=8):
    project_token = f"highlight-{uuid.uuid4()}"
    async with db.pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO projects "
            "(token, status, video_connection_status, expires_at) "
            "VALUES ($1, 'analyzing', 'missing', NOW() + INTERVAL '7 days')",
            project_token,
        )
        for index in range(segment_count):
            await conn.execute(
                "INSERT INTO transcript_segments "
                "(id, project_token, index, start_ms, end_ms, text) "
                "VALUES ($1, $2, $3, $4, $5, $6)",
                f"{project_token}-segment-{index}",
                project_token,
                index,
                index * 15_000,
                (index + 1) * 15_000,
                f"这是第{index}句真实转写内容。",
            )
    return project_token


_DIMENSIONS = {
    "informationDensity": 4,
    "hookStrength": 3,
    "standaloneClarity": 4,
    "editability": 4,
}


class RecordingDeepSeekClient:
    def __init__(self, *, score=88, quote_override=None, recommendation=None):
        self.score = score
        self.quote_override = quote_override
        self.recommendation = recommendation
        self.calls = []

    def score_windows(self, windows):
        self.calls.append("score")
        return [
            WindowScore.model_validate(
                {
                    "windowId": window.window_id,
                    "recommendation": self.recommendation or "recommended",
                    "finalScore": self.score,
                    "dimensions": _DIMENSIONS,
                    "rejectionReason": "none",
                    "topicLabel": "测试主题",
                    "type": "方法",
                    "recommendationReason": "步骤完整，可独立理解",
                }
            )
            for window in windows
        ]

    def calibrate_globally(self, candidates):
        self.calls.append("calibrate")
        # 默认 passthrough：保持原档原分，rank 按输入顺序
        return [
            GlobalCalibration(
                windowId=item.window.window_id,
                recommendation=item.recommendation,
                finalScore=item.final_score,
                globalRank=index + 1,
                calibrationNote="全局保持原序",
            )
            for index, item in enumerate(candidates)
        ]

    def select_unique_candidates(self, candidates):
        self.calls.append("select")
        return [
            BoundaryDecision.model_validate(
                {
                    "windowId": item.window.window_id,
                    "keep": True,
                    "duplicateOf": None,
                    "startSegmentId": item.window.segment_ids[0],
                    "endSegmentId": item.window.segment_ids[-1],
                    "boundaryReason": "覆盖完整观点",
                    "needsSetup": False,
                }
            )
            for item in candidates
        ]

    def generate_candidate_details(self, candidates):
        self.calls.append("details")
        return [
            CandidateDetail.model_validate(
                {
                    "windowId": item.window_id,
                    "titleOptions": [
                        f"{item.window_id} 标题一",
                        f"{item.window_id} 标题二",
                        f"{item.window_id} 标题三",
                    ],
                    "summary": "这是忠于原文的摘要。",
                    "quote": self.quote_override or item.text.split(" ")[0],
                    "editingNote": "可直接作为知识切片粗剪素材。",
                    "riskNotices": [],
                }
            )
            for item in candidates
        ]


class InvertedDuplicateDeepSeekClient(RecordingDeepSeekClient):
    def score_windows(self, windows):
        self.calls.append("score")
        return [
            WindowScore.model_validate(
                {
                    "windowId": window.window_id,
                    "recommendation": "recommended",
                    "finalScore": 70 if index == 0 else 92,
                    "dimensions": _DIMENSIONS,
                    "rejectionReason": "none",
                    "topicLabel": "测试主题",
                    "type": "方法",
                    "recommendationReason": "步骤完整，可独立理解",
                }
            )
            for index, window in enumerate(windows)
        ]

    def select_unique_candidates(self, candidates):
        self.calls.append("select")
        high_score_candidate = candidates[0]
        low_score_candidate = candidates[-1]
        decisions = [
            BoundaryDecision.model_validate(
                {
                    "windowId": low_score_candidate.window.window_id,
                    "keep": True,
                    "duplicateOf": None,
                    "startSegmentId": low_score_candidate.window.segment_ids[0],
                    "endSegmentId": low_score_candidate.window.segment_ids[-1],
                    "boundaryReason": "覆盖完整观点",
                    "needsSetup": False,
                }
            ),
            BoundaryDecision.model_validate(
                {
                    "windowId": high_score_candidate.window.window_id,
                    "keep": False,
                    "duplicateOf": low_score_candidate.window.window_id,
                    "startSegmentId": high_score_candidate.window.segment_ids[0],
                    "endSegmentId": high_score_candidate.window.segment_ids[-1],
                    "boundaryReason": "覆盖完整观点",
                    "needsSetup": False,
                }
            ),
        ]
        inverted_ids = {
            high_score_candidate.window.window_id,
            low_score_candidate.window.window_id,
        }
        for item in candidates:
            if item.window.window_id in inverted_ids:
                continue
            decisions.append(
                BoundaryDecision.model_validate(
                    {
                        "windowId": item.window.window_id,
                        "keep": True,
                        "duplicateOf": None,
                        "startSegmentId": item.window.segment_ids[0],
                        "endSegmentId": item.window.segment_ids[-1],
                        "boundaryReason": "覆盖完整观点",
                        "needsSetup": False,
                    }
                )
            )
        return decisions


class MissingDuplicateTargetDeepSeekClient(InvertedDuplicateDeepSeekClient):
    def select_unique_candidates(self, candidates):
        self.calls.append("select")
        return [
            BoundaryDecision.model_validate(
                {
                    "windowId": item.window.window_id,
                    "keep": False if index in (0, 1) else True,
                    "duplicateOf": (
                        candidates[1].window.window_id if index == 0 else None
                    ),
                    "startSegmentId": item.window.segment_ids[0],
                    "endSegmentId": item.window.segment_ids[-1],
                    "boundaryReason": "覆盖完整观点",
                    "needsSetup": False,
                }
            )
            for index, item in enumerate(candidates)
        ]


class KeepWithDuplicateTargetDeepSeekClient(RecordingDeepSeekClient):
    def select_unique_candidates(self, candidates):
        self.calls.append("select")
        duplicate_target = candidates[0].window.window_id
        return [
            BoundaryDecision.model_validate(
                {
                    "windowId": item.window.window_id,
                    "keep": True,
                    "duplicateOf": duplicate_target if index == 1 else None,
                    "startSegmentId": item.window.segment_ids[0],
                    "endSegmentId": item.window.segment_ids[-1],
                    "boundaryReason": "覆盖完整观点",
                    "needsSetup": False,
                }
            )
            for index, item in enumerate(candidates)
        ]


class InvalidBoundaryDeepSeekClient(RecordingDeepSeekClient):
    def select_unique_candidates(self, candidates):
        self.calls.append("select")
        return [
            BoundaryDecision.model_validate(
                {
                    "windowId": item.window.window_id,
                    "keep": True,
                    "duplicateOf": None,
                    "startSegmentId": item.window.segment_ids[0],
                    "endSegmentId": item.window.segment_ids[0],
                    "boundaryReason": "模型给出了过短边界",
                    "needsSetup": False,
                }
            )
            for item in candidates
        ]


@pytest.mark.asyncio
async def test_highlight_pipeline_runs_three_stages_and_builds_real_subtitles(db):
    project_token = await insert_project_with_transcript(db)
    client = RecordingDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert client.calls == ["score", "select", "details"]
        assert 1 <= len(result.candidates) <= 30
        assert result.candidates[0].rank == 1
        assert result.candidates[0].recommendation == "recommended"
        assert result.candidates[0].topic_label == "测试主题"
        assert result.candidates[0].editing_note == "可直接作为知识切片粗剪素材。"
        assert result.candidates[0].boundary_reason == "覆盖完整观点"
        assert result.candidates[0].needs_setup is False
        assert result.candidates[0].selected_title == result.candidates[0].title_options[0]
        assert result.candidates[0].subtitles[0].text == "这是第0句真实转写内容。"
        assert result.candidates[0].start_ms == result.candidates[0].subtitles[0].start_ms
        assert result.candidates[0].end_ms == result.candidates[0].subtitles[-1].end_ms
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_returns_window_score_audits(db):
    project_token = await insert_project_with_transcript(db, segment_count=16)
    client = RecordingDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert result.candidates
        assert result.window_scores
        assert {audit.selection_status for audit in result.window_scores}
        assert all(audit.topic_label for audit in result.window_scores)
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_keeps_higher_scoring_duplicate_source(db):
    project_token = await insert_project_with_transcript(db, segment_count=16)
    client = InvertedDuplicateDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert 1 < len(result.candidates) <= 30
        assert [candidate.rank for candidate in result.candidates] == list(
            range(1, len(result.candidates) + 1)
        )
        assert result.candidates[0].final_score >= result.candidates[1].final_score
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_keeps_candidate_with_missing_duplicate_target(db):
    project_token = await insert_project_with_transcript(db, segment_count=16)
    client = MissingDuplicateTargetDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert 1 < len(result.candidates) <= 30
        assert [candidate.rank for candidate in result.candidates] == list(
            range(1, len(result.candidates) + 1)
        )
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_ignores_duplicate_target_on_kept_candidate(db):
    project_token = await insert_project_with_transcript(db, segment_count=16)
    client = KeepWithDuplicateTargetDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert 1 < len(result.candidates) <= 30
        assert [candidate.rank for candidate in result.candidates] == list(
            range(1, len(result.candidates) + 1)
        )
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_falls_back_when_boundary_is_invalid(db):
    project_token = await insert_project_with_transcript(db, segment_count=16)
    client = InvalidBoundaryDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert result.candidates
        assert all(
            60_000 <= candidate.end_ms - candidate.start_ms <= 180_000
            for candidate in result.candidates
        )
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_fails_when_transcript_is_missing(db):
    project_token = await insert_project_with_transcript(db, segment_count=0)

    try:
        with pytest.raises(HighlightGenerationError) as exc_info:
            await HighlightPipeline(
                db,
                RecordingDeepSeekClient(),
            ).generate(project_token)

        assert exc_info.value.code == "no_transcript"
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_fails_when_all_windows_are_low_quality(db):
    project_token = await insert_project_with_transcript(db)
    client = RecordingDeepSeekClient(score=59, recommendation="reject")

    try:
        with pytest.raises(HighlightGenerationError) as exc_info:
            await HighlightPipeline(db, client).generate(project_token)

        assert exc_info.value.code == "no_quality_candidates"
        assert client.calls == ["score"]
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_rejects_quote_not_found_in_transcript(db):
    project_token = await insert_project_with_transcript(db)
    client = RecordingDeepSeekClient(quote_override="模型编造的金句")

    try:
        with pytest.raises(HighlightGenerationError) as exc_info:
            await HighlightPipeline(db, client).generate(project_token)

        assert exc_info.value.code == "deepseek_invalid_response"
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


def test_transcript_segment_contract_remains_strict():
    with pytest.raises(Exception):
        TranscriptSegment.model_validate(
            {
                "id": "segment",
                "index": 0,
                "start_ms": 0,
                "end_ms": 1,
                "text": "text",
                "fake": True,
            }
        )


# ---------------- 全局校准轮 (reduce) ----------------


def _scored_window(window_id, start_ms, *, recommendation="recommended", final_score=75):
    from clipwise_worker.highlight_models import CandidateWindow, ScoreDimensions

    return ScoredWindow(
        window=CandidateWindow(
            window_id=window_id,
            start_ms=start_ms,
            end_ms=start_ms + 120_000,
            segment_ids=[f"{window_id}-s1", f"{window_id}-s2"],
            text=f"{window_id} 正文",
        ),
        recommendation=recommendation,
        final_score=final_score,
        dimensions=ScoreDimensions(
            informationDensity=4, hookStrength=3, standaloneClarity=4, editability=4
        ),
        type="方法",
        rejection_reason="none",
        topic_label="测试主题",
        recommendation_reason="步骤完整",
    )


def _recall_pool(count):
    return [_scored_window(f"window-{i:04d}", i * 120_000) for i in range(count)]


class CalibrationDeepSeekClient(RecordingDeepSeekClient):
    """reduce 把所有候选升档为 strong、分数提到 95，用于验证校准覆盖。"""

    def calibrate_globally(self, candidates):
        self.calls.append("calibrate")
        return [
            GlobalCalibration(
                windowId=item.window.window_id,
                recommendation="strong",
                finalScore=95,
                globalRank=index + 1,
                calibrationNote="全局升档",
            )
            for index, item in enumerate(candidates)
        ]


class FailingCalibrationDeepSeekClient(RecordingDeepSeekClient):
    """reduce 始终失败，验证降级用原始分数继续。"""

    def calibrate_globally(self, candidates):
        self.calls.append("calibrate")
        raise DeepSeekError(
            "deepseek_request_failed", retryable=False, message="reduce 失败"
        )


def test_run_calibration_applies_when_pool_exceeds_threshold():
    pool = _recall_pool(CALIBRATION_MIN_CANDIDATES + 1)
    client = CalibrationDeepSeekClient()
    # DB 在 _run_calibration 中不使用，传 None
    pipeline = HighlightPipeline(database=None, client=client)  # type: ignore[arg-type]

    calibrated, calibration_by_window = pipeline._run_calibration(pool)

    assert client.calls == ["calibrate"]
    assert len(calibration_by_window) == len(pool)
    # 校准值覆盖了 recommendation/final_score，window 等字段保持不变
    assert all(item.recommendation == "strong" for item in calibrated)
    assert all(item.final_score == 95 for item in calibrated)
    assert calibrated[0].window.window_id == pool[0].window.window_id


def test_run_calibration_skips_when_pool_at_or_below_threshold():
    pool = _recall_pool(CALIBRATION_MIN_CANDIDATES)
    client = CalibrationDeepSeekClient()
    pipeline = HighlightPipeline(database=None, client=client)  # type: ignore[arg-type]

    calibrated, calibration_by_window = pipeline._run_calibration(pool)

    # 不调用 reduce，原样返回，校准字典为空
    assert client.calls == []
    assert calibration_by_window == {}
    assert calibrated is pool


def test_run_calibration_falls_back_on_failure():
    pool = _recall_pool(CALIBRATION_MIN_CANDIDATES + 1)
    client = FailingCalibrationDeepSeekClient()
    pipeline = HighlightPipeline(database=None, client=client)  # type: ignore[arg-type]

    calibrated, calibration_by_window = pipeline._run_calibration(pool)

    assert client.calls == ["calibrate"]
    # 降级：保持原始分数，校准字典为空
    assert calibration_by_window == {}
    assert all(item.final_score == 75 for item in calibrated)


@pytest.mark.asyncio
async def test_highlight_pipeline_runs_reduce_and_calibrates_top_candidates(db):
    # 50 segments (~12.5min) 产生 >12 个互不重叠窗口，触发 reduce
    project_token = await insert_project_with_transcript(db, segment_count=50)
    client = CalibrationDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert "calibrate" in client.calls
        # reduce 把候选升为 strong，最终候选应反映校准后的档位
        assert any(
            candidate.recommendation == "strong" for candidate in result.candidates
        )
        # 审计里进入 recall pool 的窗口应被标记 calibration_applied=True
        calibrated_audits = [
            audit
            for audit in result.window_scores
            if audit.calibration_applied is True
        ]
        assert calibrated_audits
        assert all(
            audit.calibrated_recommendation == "strong"
            for audit in calibrated_audits
        )
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )


@pytest.mark.asyncio
async def test_highlight_pipeline_skips_reduce_for_short_transcript(db):
    # 16 segments 只产生少量窗口，reduce 被跳过
    project_token = await insert_project_with_transcript(db, segment_count=16)
    client = CalibrationDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert "calibrate" not in client.calls
        # 所有审计标记为未校准
        assert all(
            audit.calibration_applied is False for audit in result.window_scores
        )
    finally:
        async with db.pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM projects WHERE token = $1",
                project_token,
            )
