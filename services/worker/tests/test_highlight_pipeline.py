import uuid

import pytest

from clipwise_worker.highlight_models import (
    BoundaryDecision,
    CandidateDetail,
    TranscriptSegment,
    WindowScore,
)
from clipwise_worker.highlight_pipeline import (
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


class RecordingDeepSeekClient:
    def __init__(self, *, score=88, quote_override=None):
        self.score = score
        self.quote_override = quote_override
        self.calls = []

    def score_windows(self, windows):
        self.calls.append("score")
        return [
            WindowScore.model_validate(
                {
                    "windowId": window.window_id,
                    "finalScore": self.score,
                    "type": "方法",
                    "recommendationReason": "步骤完整，可独立理解",
                }
            )
            for window in windows
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
                    "finalScore": 70 if index == 0 else 92,
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
                }
            ),
            BoundaryDecision.model_validate(
                {
                    "windowId": high_score_candidate.window.window_id,
                    "keep": False,
                    "duplicateOf": low_score_candidate.window.window_id,
                    "startSegmentId": high_score_candidate.window.segment_ids[0],
                    "endSegmentId": high_score_candidate.window.segment_ids[-1],
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
                }
            )
            for index, item in enumerate(candidates)
        ]


@pytest.mark.asyncio
async def test_highlight_pipeline_runs_three_stages_and_builds_real_subtitles(db):
    project_token = await insert_project_with_transcript(db)
    client = RecordingDeepSeekClient()

    try:
        result = await HighlightPipeline(db, client).generate(project_token)

        assert client.calls == ["score", "select", "details"]
        assert 1 <= len(result) <= 10
        assert result[0].rank == 1
        assert result[0].selected_title == result[0].title_options[0]
        assert result[0].subtitles[0].text == "这是第0句真实转写内容。"
        assert result[0].start_ms == result[0].subtitles[0].start_ms
        assert result[0].end_ms == result[0].subtitles[-1].end_ms
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

        assert 1 < len(result) <= 10
        assert [candidate.rank for candidate in result] == list(
            range(1, len(result) + 1)
        )
        assert result[0].final_score >= result[1].final_score
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

        assert 1 < len(result) <= 10
        assert [candidate.rank for candidate in result] == list(
            range(1, len(result) + 1)
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
    client = RecordingDeepSeekClient(score=59)

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
