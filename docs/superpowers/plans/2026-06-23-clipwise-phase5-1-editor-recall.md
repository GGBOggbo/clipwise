# Clipwise Phase 5.1 Editor Recall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Phase 5 from a TOP 10 knowledge highlight selector into a traceable editor-recall pipeline that can return up to 30 real 1–3 minute clip suggestions with recommendation tiers, editor notes, boundary reasons, setup flags, topic diversity, and persisted window-level scoring reasons.

**Architecture:** Keep the existing Groq ASR → transcript → DeepSeek strict tool pipeline, but extend the strict models, deterministic selection layer, persistence layer, and web domain model. Add one audit table for all scored windows, store final editor-facing fields on `clip_candidates`, and keep all success writes transactional so failed AI runs never produce fake or partial results.

**Tech Stack:** Python 3.12, Pydantic 2, asyncpg, OpenAI-compatible DeepSeek strict tool calling, PostgreSQL, Drizzle ORM, Next.js 16, React 19, TypeScript, Vitest, Playwright, pytest.

---

## Preflight

The worktree currently has two unrelated unstaged player-bugfix files:

- `apps/web/components/project/LocalVideoPlayer.module.css`
- `apps/web/e2e/project-interactions.spec.ts`

Before executing Task 1, either commit those two files separately or leave them unstaged throughout Phase 5.1. Do not include them in Phase 5.1 commits.

Run:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek
git status --short
```

Expected: the two player-bugfix files may be modified; Phase 5.1 implementation files should start clean.

Worker commands must unset local proxy variables:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek/services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest -q
```

---

## File Structure

### Create

- `services/worker/clipwise_worker/highlight_selection.py`
  - Editor-recall filtering, ranking, time de-duplication, topic diversification, and selection status assignment.
- `services/worker/tests/test_highlight_selection.py`
  - Pure tests for recommendation ranking, rejection rules, overlap threshold, topic diversity, and max 30 behavior.
- `datasets/editor-recall-labels/README.md`
  - Human-label holdout-set contract.
- `datasets/editor-recall-labels/examples.jsonl`
  - Two concrete label examples.
- `apps/web/db/migrations/0002_phase5_1_editor_recall.sql`
  - Adds final candidate columns and `highlight_window_scores`.

### Modify

- `apps/web/db/schema.ts`
  - Add final candidate fields and `highlightWindowScores`.
- `packages/shared/src/domain.ts`
  - Add `Recommendation`, `RejectionReason`, new `ClipCandidate` fields, and label helpers.
- `packages/shared/src/fixtures.ts`
  - Add defaults for new fields.
- `apps/web/features/project-mapping.ts`
  - Map DB rows to new shared fields.
- `apps/web/app/api/projects/[token]/candidates/[id]/route.ts`
  - Keep new AI/audit fields read-only during PATCH.
- `apps/web/components/project/CandidateCard.tsx`
  - Show recommendation from model, topic label, and setup flag.
- `apps/web/components/project/CandidateCard.module.css`
  - Style topic/setup metadata.
- `apps/web/components/project/EditorTabs.tsx`
  - Show editor note and boundary reason.
- `apps/web/tests/shared/domain.test.ts`
  - Update recommendation helper tests.
- `apps/web/tests/db/schema.test.ts`
  - Assert new table and columns.
- `apps/web/tests/lib/candidate-api.test.ts`
  - Ensure PATCH payload excludes read-only AI fields or preserves mapped response.
- `apps/web/tests/api/get-clips.test.ts`
  - Assert new fields are returned.
- `apps/web/tests/integration/real-deepseek-candidates.test.ts`
  - Assert new Phase 5.1 fields and persisted window scores.
- `services/worker/clipwise_worker/highlight_models.py`
  - Add recommendation, dimensions, rejection reason, topic label, editor fields, and audit records.
- `services/worker/clipwise_worker/highlight_windows.py`
  - Change default window duration to 120s target, 60–180s range, 45s step; keep quote verification.
- `services/worker/clipwise_worker/deepseek.py`
  - Update prompts and payload/response schema usage.
- `services/worker/clipwise_worker/highlight_pipeline.py`
  - Use editor-recall scoring, selection, boundary decisions, and final detail generation.
- `services/worker/clipwise_worker/candidates.py`
  - Persist final candidates and window scores in one transaction.
- `services/worker/tests/test_deepseek_contracts.py`
  - Strict schema tests for new enums and nested dimensions.
- `services/worker/tests/test_deepseek_client.py`
  - Validate strict tool schema includes new fields and prompts use editor-recall role.
- `services/worker/tests/test_highlight_windows.py`
  - Update duration expectations.
- `services/worker/tests/test_highlight_pipeline.py`
  - Update fake client and expectations.
- `services/worker/tests/test_candidate_persistence.py`
  - Verify candidate fields and window-score persistence.
- `services/worker/tests/test_pipeline_candidates.py`
  - Verify failure/regeneration behavior preserves old window scores.
- `task_plan.md`
- `findings.md`
- `progress.md`

---

## Task 1: Database schema for editor recall fields and window scores

**Files:**
- Modify: `apps/web/db/schema.ts`
- Create: `apps/web/db/migrations/0002_phase5_1_editor_recall.sql`
- Modify: `apps/web/tests/db/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

In `apps/web/tests/db/schema.test.ts`, extend the existing schema assertions with:

```ts
import { clipCandidates, highlightWindowScores } from "@/db/schema";

it("defines editor recall fields on clip candidates", () => {
  expect(clipCandidates.recommendation).toBeDefined();
  expect(clipCandidates.topicLabel).toBeDefined();
  expect(clipCandidates.editingNote).toBeDefined();
  expect(clipCandidates.boundaryReason).toBeDefined();
  expect(clipCandidates.needsSetup).toBeDefined();
  expect(clipCandidates.rejectionReason).toBeDefined();
});

it("defines highlight window score audit table", () => {
  expect(highlightWindowScores.id).toBeDefined();
  expect(highlightWindowScores.projectToken).toBeDefined();
  expect(highlightWindowScores.windowId).toBeDefined();
  expect(highlightWindowScores.recommendation).toBeDefined();
  expect(highlightWindowScores.informationDensity).toBeDefined();
  expect(highlightWindowScores.hookStrength).toBeDefined();
  expect(highlightWindowScores.standaloneClarity).toBeDefined();
  expect(highlightWindowScores.editability).toBeDefined();
  expect(highlightWindowScores.selectionStatus).toBeDefined();
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run apps/web/tests/db/schema.test.ts
```

Expected: FAIL because `highlightWindowScores` and the new `clipCandidates` fields do not exist.

- [ ] **Step 3: Update Drizzle schema**

In `apps/web/db/schema.ts`, add these columns to `clipCandidates`:

```ts
  recommendation: text("recommendation").notNull().default("recommended"),
  topicLabel: text("topic_label").notNull().default(""),
  editingNote: text("editing_note").notNull().default(""),
  boundaryReason: text("boundary_reason").notNull().default(""),
  needsSetup: boolean("needs_setup").notNull().default(false),
  rejectionReason: text("rejection_reason").notNull().default("none"),
```

Also add:

```ts
export const highlightWindowScores = pgTable("highlight_window_scores", {
  id: text("id").primaryKey(),
  projectToken: text("project_token")
    .notNull()
    .references(() => projects.token, { onDelete: "cascade" }),
  windowId: text("window_id").notNull(),
  startMs: bigint("start_ms", { mode: "number" }).notNull(),
  endMs: bigint("end_ms", { mode: "number" }).notNull(),
  durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
  segmentIds: text("segment_ids").array().notNull(),
  textPreview: text("text_preview").notNull(),
  recommendation: text("recommendation").notNull(),
  finalScore: integer("final_score").notNull(),
  type: clipTypeEnum("type").notNull(),
  informationDensity: integer("information_density").notNull(),
  hookStrength: integer("hook_strength").notNull(),
  standaloneClarity: integer("standalone_clarity").notNull(),
  editability: integer("editability").notNull(),
  rejectionReason: text("rejection_reason").notNull(),
  topicLabel: text("topic_label").notNull(),
  recommendationReason: text("recommendation_reason").notNull(),
  selectionStatus: text("selection_status").notNull(),
  selectionReason: text("selection_reason").notNull(),
  duplicateOfWindowId: text("duplicate_of_window_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Add SQL migration**

Create `apps/web/db/migrations/0002_phase5_1_editor_recall.sql`:

```sql
ALTER TABLE "clip_candidates" ADD COLUMN "recommendation" text DEFAULT 'recommended' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "topic_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "editing_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "boundary_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "needs_setup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "rejection_reason" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE TABLE "highlight_window_scores" (
  "id" text PRIMARY KEY NOT NULL,
  "project_token" text NOT NULL,
  "window_id" text NOT NULL,
  "start_ms" bigint NOT NULL,
  "end_ms" bigint NOT NULL,
  "duration_ms" bigint NOT NULL,
  "segment_ids" text[] NOT NULL,
  "text_preview" text NOT NULL,
  "recommendation" text NOT NULL,
  "final_score" integer NOT NULL,
  "type" "clip_type" NOT NULL,
  "information_density" integer NOT NULL,
  "hook_strength" integer NOT NULL,
  "standalone_clarity" integer NOT NULL,
  "editability" integer NOT NULL,
  "rejection_reason" text NOT NULL,
  "topic_label" text NOT NULL,
  "recommendation_reason" text NOT NULL,
  "selection_status" text NOT NULL,
  "selection_reason" text NOT NULL,
  "duplicate_of_window_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "highlight_window_scores" ADD CONSTRAINT "highlight_window_scores_project_token_projects_token_fk" FOREIGN KEY ("project_token") REFERENCES "public"."projects"("token") ON DELETE cascade ON UPDATE no action;
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run apps/web/tests/db/schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Apply migration locally and check drift**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' pnpm db:migrate
pnpm db:generate
git status --short apps/web/db
```

Expected: migration applies; `pnpm db:generate` does not create conflicting schema changes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/db/schema.ts apps/web/db/migrations/0002_phase5_1_editor_recall.sql apps/web/tests/db/schema.test.ts
git commit -m "feat: add editor recall database schema"
```

---

## Task 2: Shared domain, fixtures, API mapping, and recommendation labels

**Files:**
- Modify: `packages/shared/src/domain.ts`
- Modify: `packages/shared/src/fixtures.ts`
- Modify: `apps/web/features/project-mapping.ts`
- Modify: `apps/web/tests/shared/domain.test.ts`
- Modify: `apps/web/tests/api/get-clips.test.ts`
- Modify: `apps/web/tests/db/seed.test.ts`

- [ ] **Step 1: Write failing shared-domain tests**

In `apps/web/tests/shared/domain.test.ts`, replace score-threshold assertions with:

```ts
import { getRecommendationLevel } from "@clipwise/shared";

it("maps model recommendation tiers to Chinese labels", () => {
  expect(getRecommendationLevel("strong")).toBe("强推荐");
  expect(getRecommendationLevel("recommended")).toBe("推荐");
  expect(getRecommendationLevel("backup")).toBe("备选");
});
```

- [ ] **Step 2: Write failing API mapping assertion**

In `apps/web/tests/api/get-clips.test.ts`, extend the expected clip shape:

```ts
expect(clips[0]).toMatchObject({
  recommendation: "recommended",
  topicLabel: expect.any(String),
  editingNote: expect.any(String),
  boundaryReason: expect.any(String),
  needsSetup: false,
  rejectionReason: "none",
});
```

- [ ] **Step 3: Run failing web tests**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run \
  apps/web/tests/shared/domain.test.ts \
  apps/web/tests/api/get-clips.test.ts \
  apps/web/tests/db/seed.test.ts
```

Expected: FAIL because shared types and fixtures do not contain the new fields.

- [ ] **Step 4: Update shared domain**

In `packages/shared/src/domain.ts`, add:

```ts
export type Recommendation = "strong" | "recommended" | "backup" | "reject";

export type RejectionReason =
  | "none"
  | "small_talk"
  | "transition"
  | "fragmented"
  | "duplicate"
  | "low_information"
  | "asr_noise"
  | "too_context_dependent"
  | "promotion_or_admin";
```

Extend `ClipCandidate`:

```ts
  recommendation: Recommendation;
  topicLabel: string;
  editingNote: string;
  boundaryReason: string;
  needsSetup: boolean;
  rejectionReason: RejectionReason;
```

Replace the old score helper with:

```ts
export function getRecommendationLevel(
  recommendation: Exclude<Recommendation, "reject">,
): "强推荐" | "推荐" | "备选" {
  if (recommendation === "strong") return "强推荐";
  if (recommendation === "recommended") return "推荐";
  return "备选";
}
```

- [ ] **Step 5: Update fixtures and seed inputs**

In `packages/shared/src/fixtures.ts`, add defaults in the candidate factory:

```ts
recommendation: seed.recommendation ?? "recommended",
topicLabel: seed.topicLabel ?? seed.type,
editingNote: seed.editingNote ?? "",
boundaryReason: seed.boundaryReason ?? "",
needsSetup: seed.needsSetup ?? false,
rejectionReason: seed.rejectionReason ?? "none",
```

Update `apps/web/db/seed.ts` inserts to include:

```ts
recommendation: c.recommendation,
topicLabel: c.topicLabel,
editingNote: c.editingNote,
boundaryReason: c.boundaryReason,
needsSetup: c.needsSetup,
rejectionReason: c.rejectionReason,
```

- [ ] **Step 6: Update project mapping**

In `apps/web/features/project-mapping.ts`, add fields to `CandidateRow`:

```ts
  recommendation: ClipCandidate["recommendation"];
  topicLabel: string;
  editingNote: string;
  boundaryReason: string;
  needsSetup: boolean;
  rejectionReason: ClipCandidate["rejectionReason"];
```

Map them into `ClipCandidate`:

```ts
recommendation: c.recommendation,
topicLabel: c.topicLabel,
editingNote: c.editingNote,
boundaryReason: c.boundaryReason,
needsSetup: c.needsSetup,
rejectionReason: c.rejectionReason,
```

- [ ] **Step 7: Run tests**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run \
  apps/web/tests/shared/domain.test.ts \
  apps/web/tests/api/get-clips.test.ts \
  apps/web/tests/db/seed.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/domain.ts packages/shared/src/fixtures.ts \
  apps/web/db/seed.ts apps/web/features/project-mapping.ts \
  apps/web/tests/shared/domain.test.ts apps/web/tests/api/get-clips.test.ts \
  apps/web/tests/db/seed.test.ts
git commit -m "feat: expose editor recall candidate fields"
```

---

## Task 3: Worker strict contracts for editor recall

**Files:**
- Modify: `services/worker/clipwise_worker/highlight_models.py`
- Modify: `services/worker/tests/test_deepseek_contracts.py`

- [ ] **Step 1: Write failing contract tests**

Add tests in `services/worker/tests/test_deepseek_contracts.py`:

```python
import pytest
from pydantic import ValidationError

from clipwise_worker.highlight_models import ScoreBatchResponse


def valid_score_item(**overrides):
    item = {
        "windowId": "window-0001",
        "recommendation": "recommended",
        "finalScore": 76,
        "dimensions": {
            "informationDensity": 4,
            "hookStrength": 3,
            "standaloneClarity": 4,
            "editability": 4,
        },
        "rejectionReason": "none",
        "topicLabel": "AI 项目报价",
        "type": "方法",
        "recommendationReason": "有明确判断标准。",
    }
    item.update(overrides)
    return item


def test_score_response_accepts_editor_recall_fields():
    response = ScoreBatchResponse.model_validate({"items": [valid_score_item()]})

    score = response.items[0]
    assert score.recommendation == "recommended"
    assert score.dimensions.information_density == 4
    assert score.topic_label == "AI 项目报价"


@pytest.mark.parametrize(
    "field,value",
    [
        ("recommendation", "maybe"),
        ("rejectionReason", "boring"),
    ],
)
def test_score_response_rejects_invalid_editor_enums(field, value):
    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate({"items": [valid_score_item(**{field: value})]})


def test_score_response_rejects_dimension_out_of_range():
    item = valid_score_item(
        dimensions={
            "informationDensity": 6,
            "hookStrength": 3,
            "standaloneClarity": 4,
            "editability": 4,
        }
    )

    with pytest.raises(ValidationError):
        ScoreBatchResponse.model_validate({"items": [item]})
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest tests/test_deepseek_contracts.py -v
```

Expected: FAIL because the new fields and dimension model do not exist.

- [ ] **Step 3: Extend strict models**

In `highlight_models.py`, add:

```python
Recommendation = Literal["strong", "recommended", "backup", "reject"]
RejectionReason = Literal[
    "none",
    "small_talk",
    "transition",
    "fragmented",
    "duplicate",
    "low_information",
    "asr_noise",
    "too_context_dependent",
    "promotion_or_admin",
]
SelectionStatus = Literal[
    "scored",
    "below_recall_threshold",
    "time_duplicate",
    "semantic_duplicate",
    "topic_diversity_skipped",
    "selected",
    "rejected",
]
```

Add:

```python
class ScoreDimensions(StrictModel):
    information_density: int = Field(alias="informationDensity", ge=1, le=5)
    hook_strength: int = Field(alias="hookStrength", ge=1, le=5)
    standalone_clarity: int = Field(alias="standaloneClarity", ge=1, le=5)
    editability: int = Field(ge=1, le=5)
```

Change `WindowScore` to include:

```python
    recommendation: Recommendation
    dimensions: ScoreDimensions
    rejection_reason: RejectionReason = Field(alias="rejectionReason")
    topic_label: str = Field(alias="topicLabel")
```

Change `ScoredWindow`, `FinalCandidateInput`, and `FinalCandidate` to carry:

```python
recommendation: Recommendation
dimensions: ScoreDimensions
rejection_reason: RejectionReason
topic_label: str
needs_setup: bool = False
boundary_reason: str = ""
```

Change `BoundaryDecision` to include:

```python
boundary_reason: str = Field(alias="boundaryReason")
needs_setup: bool = Field(alias="needsSetup")
```

Change `CandidateDetail` to include:

```python
editing_note: str = Field(alias="editingNote")
```

Add audit model:

```python
class WindowScoreAudit(StrictModel):
    window_id: str
    start_ms: int
    end_ms: int
    segment_ids: list[str]
    text_preview: str
    recommendation: Recommendation
    final_score: int = Field(ge=0, le=100)
    type: ClipType
    dimensions: ScoreDimensions
    rejection_reason: RejectionReason
    topic_label: str
    recommendation_reason: str
    selection_status: SelectionStatus
    selection_reason: str
    duplicate_of_window_id: str | None = None
```

- [ ] **Step 4: Run contract tests**

Run the same pytest command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/worker/clipwise_worker/highlight_models.py services/worker/tests/test_deepseek_contracts.py
git commit -m "feat: add editor recall strict contracts"
```

---

## Task 4: Window generation and deterministic editor-recall selection

**Files:**
- Modify: `services/worker/clipwise_worker/highlight_windows.py`
- Create: `services/worker/clipwise_worker/highlight_selection.py`
- Modify: `services/worker/tests/test_highlight_windows.py`
- Create: `services/worker/tests/test_highlight_selection.py`

- [ ] **Step 1: Update failing window duration test**

In `services/worker/tests/test_highlight_windows.py`, update `test_generate_windows_aligns_to_segments_and_target_duration`:

```python
def test_generate_windows_aligns_to_segments_and_editor_recall_duration():
    segments = make_segments(12)

    windows = generate_candidate_windows(segments)

    assert windows[0].start_ms == segments[0].start_ms
    assert windows[0].end_ms == segments[7].end_ms
    assert windows[0].segment_ids == [segment.id for segment in segments[:8]]
    assert windows[1].start_ms == segments[3].start_ms
    assert all(60_000 <= window.end_ms - window.start_ms <= 180_000 for window in windows)
```

- [ ] **Step 2: Add failing selection tests**

Create `services/worker/tests/test_highlight_selection.py`:

```python
from clipwise_worker.highlight_models import (
    CandidateWindow,
    ScoreDimensions,
    ScoredWindow,
)
from clipwise_worker.highlight_selection import (
    select_editor_recall_pool,
    diversify_by_topic,
)


DIMENSIONS = ScoreDimensions.model_validate(
    {
        "informationDensity": 4,
        "hookStrength": 3,
        "standaloneClarity": 4,
        "editability": 4,
    }
)


def scored(
    window_id,
    start_ms,
    end_ms,
    *,
    recommendation="recommended",
    final_score=75,
    topic_label="AI 项目",
    rejection_reason="none",
    needs_setup=False,
):
    return ScoredWindow(
        window=CandidateWindow(
            window_id=window_id,
            start_ms=start_ms,
            end_ms=end_ms,
            segment_ids=[f"{window_id}-s1", f"{window_id}-s2"],
            text=f"{window_id} text",
        ),
        recommendation=recommendation,
        final_score=final_score,
        dimensions=DIMENSIONS,
        type="方法",
        rejection_reason=rejection_reason,
        topic_label=topic_label,
        recommendation_reason="值得剪辑师查看",
        needs_setup=needs_setup,
        boundary_reason="",
    )


def test_select_pool_keeps_backup_but_rejects_hard_negative_reasons():
    selected, audits = select_editor_recall_pool(
        [
            scored("strong", 0, 120_000, recommendation="strong", final_score=88),
            scored("backup", 200_000, 320_000, recommendation="backup", final_score=58),
            scored("reject", 400_000, 520_000, recommendation="reject", final_score=90),
            scored("noise", 600_000, 720_000, recommendation="backup", final_score=80, rejection_reason="asr_noise"),
        ]
    )

    assert [item.window.window_id for item in selected] == ["strong", "backup"]
    statuses = {audit.window_id: audit.selection_status for audit in audits}
    assert statuses["reject"] == "rejected"
    assert statuses["noise"] == "rejected"


def test_select_pool_uses_seventy_percent_overlap_threshold():
    selected, audits = select_editor_recall_pool(
        [
            scored("base", 0, 100_000, recommendation="strong", final_score=90),
            scored("overlap", 29_000, 129_000, recommendation="strong", final_score=89),
        ]
    )

    assert [item.window.window_id for item in selected] == ["base"]
    assert {audit.window_id: audit.selection_status for audit in audits}["overlap"] == "time_duplicate"


def test_diversify_by_topic_prevents_single_topic_from_filling_top_thirty():
    candidates = [
        scored(f"same-{index}", index * 200_000, index * 200_000 + 120_000, topic_label="同一主题", final_score=95 - index)
        for index in range(8)
    ] + [
        scored("other-1", 2_000_000, 2_120_000, topic_label="其它主题", final_score=70),
        scored("other-2", 2_200_000, 2_320_000, topic_label="第三主题", final_score=69),
    ]

    selected, audits = diversify_by_topic(candidates, target_count=30, max_per_topic=4)

    assert [item.window.window_id for item in selected].count("same-0") == 1
    assert sum(1 for item in selected if item.topic_label == "同一主题") == 4
    assert {"other-1", "other-2"}.issubset({item.window.window_id for item in selected})
    assert {audit.window_id: audit.selection_status for audit in audits}["same-4"] == "topic_diversity_skipped"
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest tests/test_highlight_windows.py tests/test_highlight_selection.py -v
```

Expected: FAIL because defaults and selection module do not exist.

- [ ] **Step 4: Update window defaults**

In `highlight_windows.py`, change `generate_candidate_windows` defaults:

```python
target_ms: int = 120_000,
min_ms: int = 60_000,
max_ms: int = 180_000,
step_ms: int = 45_000,
```

Update `apply_boundary_decision` duration guard:

```python
if duration_ms < 60_000 or duration_ms > 180_000:
    raise ValueError("boundary duration must be between 60 and 180 seconds")
```

- [ ] **Step 5: Implement selection module**

Create `highlight_selection.py` with:

```python
from __future__ import annotations

from collections import defaultdict

from .highlight_models import ScoredWindow, WindowScoreAudit
from .highlight_windows import overlap_ratio


RECOMMENDATION_ORDER = {"strong": 0, "recommended": 1, "backup": 2, "reject": 3}
HARD_REJECT_REASONS = {
    "small_talk",
    "transition",
    "fragmented",
    "asr_noise",
    "promotion_or_admin",
}
MIN_RECALL_SCORE = 45
TIME_OVERLAP_THRESHOLD = 0.7


def _sort_key(item: ScoredWindow):
    return (
        RECOMMENDATION_ORDER[item.recommendation],
        -item.final_score,
        item.needs_setup,
        item.window.start_ms,
        item.window.window_id,
    )


def _audit(item: ScoredWindow, status: str, reason: str, duplicate_of: str | None = None):
    return WindowScoreAudit(
        window_id=item.window.window_id,
        start_ms=item.window.start_ms,
        end_ms=item.window.end_ms,
        segment_ids=item.window.segment_ids,
        text_preview=item.window.text[:240],
        recommendation=item.recommendation,
        final_score=item.final_score,
        type=item.type,
        dimensions=item.dimensions,
        rejection_reason=item.rejection_reason,
        topic_label=item.topic_label,
        recommendation_reason=item.recommendation_reason,
        selection_status=status,
        selection_reason=reason,
        duplicate_of_window_id=duplicate_of,
    )


def select_editor_recall_pool(
    items: list[ScoredWindow],
    *,
    max_candidates: int = 60,
) -> tuple[list[ScoredWindow], list[WindowScoreAudit]]:
    selected: list[ScoredWindow] = []
    audits: list[WindowScoreAudit] = []
    for item in sorted(items, key=_sort_key):
        if item.recommendation == "reject":
            audits.append(_audit(item, "rejected", "model_recommendation_reject"))
            continue
        if item.final_score < MIN_RECALL_SCORE:
            audits.append(_audit(item, "below_recall_threshold", "final_score_below_45"))
            continue
        if item.rejection_reason in HARD_REJECT_REASONS:
            audits.append(_audit(item, "rejected", f"hard_reject_reason:{item.rejection_reason}"))
            continue
        duplicate = next(
            (
                existing
                for existing in selected
                if overlap_ratio(item.window, existing.window) > TIME_OVERLAP_THRESHOLD
            ),
            None,
        )
        if duplicate is not None:
            audits.append(_audit(item, "time_duplicate", "overlap_above_0.7", duplicate.window.window_id))
            continue
        selected.append(item)
        audits.append(_audit(item, "scored", "entered_recall_pool"))
        if len(selected) >= max_candidates:
            break
    return selected, audits


def diversify_by_topic(
    items: list[ScoredWindow],
    *,
    target_count: int = 30,
    max_per_topic: int = 4,
) -> tuple[list[ScoredWindow], list[WindowScoreAudit]]:
    buckets: dict[str, list[ScoredWindow]] = defaultdict(list)
    for item in sorted(items, key=_sort_key):
        buckets[item.topic_label].append(item)

    selected: list[ScoredWindow] = []
    selected_ids: set[str] = set()
    audits: list[WindowScoreAudit] = []

    while len(selected) < target_count:
        added = False
        for topic in sorted(buckets):
            topic_selected = [item for item in selected if item.topic_label == topic]
            if len(topic_selected) >= max_per_topic:
                continue
            next_item = next(
                (
                    item
                    for item in buckets[topic]
                    if item.window.window_id not in selected_ids
                    and item.recommendation in {"strong", "recommended"}
                ),
                None,
            )
            if next_item is None:
                continue
            selected.append(next_item)
            selected_ids.add(next_item.window.window_id)
            audits.append(_audit(next_item, "selected", "selected_by_topic_diversity"))
            added = True
            if len(selected) >= target_count:
                break
        if not added:
            break

    for item in sorted(items, key=_sort_key):
        if len(selected) >= target_count:
            break
        if item.window.window_id in selected_ids:
            continue
        if item.recommendation == "backup" and sum(
            1 for existing in selected if existing.topic_label == item.topic_label
        ) < max_per_topic:
            selected.append(item)
            selected_ids.add(item.window.window_id)
            audits.append(_audit(item, "selected", "backup_selected_to_fill_target"))

    for item in sorted(items, key=_sort_key):
        if len(selected) >= target_count:
            break
        if item.window.window_id in selected_ids:
            continue
        selected.append(item)
        selected_ids.add(item.window.window_id)
        audits.append(_audit(item, "selected", "global_backfill_without_fake_candidates"))

    for item in items:
        if item.window.window_id not in selected_ids:
            audits.append(_audit(item, "topic_diversity_skipped", "topic_soft_cap_or_rank_limit"))

    return selected, audits
```

- [ ] **Step 6: Run tests**

Run the same pytest command from Step 3.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/worker/clipwise_worker/highlight_windows.py \
  services/worker/clipwise_worker/highlight_selection.py \
  services/worker/tests/test_highlight_windows.py \
  services/worker/tests/test_highlight_selection.py
git commit -m "feat: add editor recall selection rules"
```

---

## Task 5: DeepSeek prompts and strict client behavior

**Files:**
- Modify: `services/worker/clipwise_worker/deepseek.py`
- Modify: `services/worker/tests/test_deepseek_client.py`

- [ ] **Step 1: Add failing DeepSeek client tests**

In `services/worker/tests/test_deepseek_client.py`, add a fake SDK test that captures messages:

```python
def test_score_prompt_uses_editor_recall_role(fake_sdk_client):
    client = DeepSeekClient(
        api_key="key",
        base_url="https://api.deepseek.com/beta",
        model="deepseek-v4-flash",
        sdk_client=fake_sdk_client,
        sleeper=lambda _: None,
    )

    client.score_windows([CandidateWindow(window_id="window-0001", start_ms=0, end_ms=120000, segment_ids=["s1"], text="有效内容")])

    system_prompt = fake_sdk_client.chat.completions.calls[0]["messages"][0]["content"]
    assert "剪辑师" in system_prompt
    assert "不是判断最终爆款" in system_prompt
    assert "backup" in system_prompt
```

Add a response fixture for score calls with:

```json
{
  "items": [
    {
      "windowId": "window-0001",
      "recommendation": "recommended",
      "finalScore": 76,
      "dimensions": {
        "informationDensity": 4,
        "hookStrength": 3,
        "standaloneClarity": 4,
        "editability": 4
      },
      "rejectionReason": "none",
      "topicLabel": "AI 项目",
      "type": "方法",
      "recommendationReason": "值得剪辑师查看"
    }
  ]
}
```

- [ ] **Step 2: Run failing DeepSeek tests**

Run:

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest tests/test_deepseek_client.py -v
```

Expected: FAIL because prompts and fake response parsing are still Phase 5 shaped.

- [ ] **Step 3: Update score prompt and payload**

In `DeepSeekClient.score_windows`, change system prompt to:

```python
system_prompt=(
    "你是服务剪辑师的直播回放素材筛选助手。你的任务不是判断最终爆款，"
    "而是判断这段是否值得剪辑师点开看一眼，并且是否有机会剪成一条"
    "1到3分钟的独立短视频。逐个评估输入窗口，不得遗漏、增加或改写"
    "windowId。输出 recommendation: strong/recommended/backup/reject，"
    "finalScore 仅用于同档排序。按 informationDensity、hookStrength、"
    "standaloneClarity、editability 四个1到5分维度评分。纯寒暄、过渡、"
    "重复、行政信息、ASR噪声必须 reject；有潜力但需要补上下文的内容"
    "可标为 backup。topicLabel 要短、稳定、适合主题分散。"
)
```

- [ ] **Step 4: Update selection and detail prompts**

In `select_unique_candidates`, include `recommendation`, `topicLabel`, `rejectionReason`, and `needsSetup` in payload.

Change selection prompt to require `boundaryReason` and `needsSetup`.

In `generate_candidate_details`, require `editingNote` and preserve quote rule:

```python
system_prompt=(
    "为每个最终剪辑素材生成三个忠于原文的中文标题、摘要、逐字原文金句、"
    "剪辑师 editingNote 和风险提示。quote 必须是输入 text 中连续出现的原文，"
    "不得润色、拼接或添加信息。editingNote 是给剪辑师的处理建议，"
    "不得伪造 transcript 中不存在的事实。不得遗漏或增加 ID。"
)
```

- [ ] **Step 5: Run tests**

Run the same pytest command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/worker/clipwise_worker/deepseek.py services/worker/tests/test_deepseek_client.py
git commit -m "feat: retarget deepseek prompts for editor recall"
```

---

## Task 6: Pipeline assembly with audits, topic diversity, and max 30 candidates

**Files:**
- Modify: `services/worker/clipwise_worker/highlight_pipeline.py`
- Modify: `services/worker/tests/test_highlight_pipeline.py`

- [ ] **Step 1: Update fake client response shape**

In `services/worker/tests/test_highlight_pipeline.py`, update `RecordingDeepSeekClient.score_windows` to return:

```python
WindowScore.model_validate(
    {
        "windowId": window.window_id,
        "recommendation": "recommended",
        "finalScore": self.score,
        "dimensions": {
            "informationDensity": 4,
            "hookStrength": 3,
            "standaloneClarity": 4,
            "editability": 4,
        },
        "rejectionReason": "none",
        "topicLabel": "测试主题",
        "type": "方法",
        "recommendationReason": "步骤完整，可独立理解",
    }
)
```

Update `BoundaryDecision.model_validate` fixtures to include:

```python
"boundaryReason": "覆盖完整观点",
"needsSetup": False,
```

Update `CandidateDetail.model_validate` fixtures to include:

```python
"editingNote": "可直接作为知识切片粗剪素材。",
```

- [ ] **Step 2: Add failing pipeline assertions**

In `test_highlight_pipeline_runs_three_stages_and_builds_real_subtitles`, add:

```python
assert len(result) <= 30
assert result[0].recommendation == "recommended"
assert result[0].topic_label == "测试主题"
assert result[0].editing_note == "可直接作为知识切片粗剪素材。"
assert result[0].boundary_reason == "覆盖完整观点"
assert result[0].needs_setup is False
```

Add a new test:

```python
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
            await conn.execute("DELETE FROM projects WHERE token = $1", project_token)
```

- [ ] **Step 3: Run failing pipeline tests**

Run:

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest tests/test_highlight_pipeline.py -v
```

Expected: FAIL because `generate()` still returns `list[FinalCandidate]` and lacks editor fields.

- [ ] **Step 4: Add pipeline result model**

In `highlight_models.py`, add:

```python
class HighlightPipelineResult(StrictModel):
    candidates: list[FinalCandidate]
    window_scores: list[WindowScoreAudit]
```

In `highlight_pipeline.py`, change `generate()` return type to `HighlightPipelineResult`.

- [ ] **Step 5: Update scoring conversion**

In `_score_windows`, build `ScoredWindow` with:

```python
recommendation=score.recommendation,
final_score=score.final_score,
dimensions=score.dimensions,
type=score.type,
rejection_reason=score.rejection_reason,
topic_label=score.topic_label,
recommendation_reason=score.recommendation_reason,
```

- [ ] **Step 6: Use selection module**

Replace `select_time_unique_windows(scored)` with:

```python
recall_pool, pool_audits = select_editor_recall_pool(scored)
```

After semantic selection and boundary application, call:

```python
diverse, diversity_audits = diversify_by_topic(bounded, target_count=30)
```

Sort final `diverse` by the same recommendation-aware order and assign ranks 1..N.

If no `recall_pool` or no final `diverse`, raise:

```python
HighlightGenerationError("no_quality_candidates", "没有达到召回要求的候选片段")
```

- [ ] **Step 7: Carry boundary/detail fields into final candidates**

When applying boundary decisions, copy:

```python
needs_setup=decision.needs_setup,
boundary_reason=decision.boundary_reason,
```

When building `FinalCandidate`, set:

```python
recommendation=candidate.recommendation,
dimensions=candidate.dimensions,
rejection_reason=candidate.rejection_reason,
topic_label=candidate.topic_label,
editing_note=detail.editing_note,
boundary_reason=candidate.boundary_reason,
needs_setup=candidate.needs_setup,
```

Return:

```python
return HighlightPipelineResult(
    candidates=final,
    window_scores=merge_window_score_audits(scored, pool_audits, diversity_audits),
)
```

Implement `merge_window_score_audits` in `highlight_selection.py` so the latest status per `window_id` wins, and all scored windows have exactly one audit.

- [ ] **Step 8: Run pipeline tests**

Run the same pytest command from Step 3.

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add services/worker/clipwise_worker/highlight_models.py \
  services/worker/clipwise_worker/highlight_pipeline.py \
  services/worker/clipwise_worker/highlight_selection.py \
  services/worker/tests/test_highlight_pipeline.py
git commit -m "feat: assemble editor recall pipeline result"
```

---

## Task 7: Persist final candidates and window score audits atomically

**Files:**
- Modify: `services/worker/clipwise_worker/candidates.py`
- Modify: `services/worker/clipwise_worker/pipeline.py`
- Modify: `services/worker/tests/test_candidate_persistence.py`
- Modify: `services/worker/tests/test_pipeline_candidates.py`

- [ ] **Step 1: Write failing persistence test**

In `services/worker/tests/test_candidate_persistence.py`, update `final_candidate()` to include new fields:

```python
recommendation="recommended",
dimensions=ScoreDimensions.model_validate({
    "informationDensity": 4,
    "hookStrength": 3,
    "standaloneClarity": 4,
    "editability": 4,
}),
rejection_reason="none",
topic_label="测试主题",
editing_note="这段可以直接粗剪。",
boundary_reason="从观点开始，到结论结束。",
needs_setup=False,
```

Add helper:

```python
from clipwise_worker.highlight_models import WindowScoreAudit


def audit(window_id: str) -> WindowScoreAudit:
    return WindowScoreAudit(
        window_id=window_id,
        start_ms=0,
        end_ms=120_000,
        segment_ids=["s1", "s2"],
        text_preview="窗口预览",
        recommendation="recommended",
        final_score=80,
        type="方法",
        dimensions=ScoreDimensions.model_validate({
            "informationDensity": 4,
            "hookStrength": 3,
            "standaloneClarity": 4,
            "editability": 4,
        }),
        rejection_reason="none",
        topic_label="测试主题",
        recommendation_reason="值得查看",
        selection_status="selected",
        selection_reason="selected_by_topic_diversity",
        duplicate_of_window_id=None,
    )
```

Call persistence as:

```python
await replace_project_candidates(
    db,
    token,
    [final_candidate(1, title="第一条")],
    [audit("window-0001")],
)
```

Assert:

```python
row = await conn.fetchrow(
    "SELECT recommendation, topic_label, editing_note, boundary_reason, needs_setup, rejection_reason FROM clip_candidates WHERE project_token = $1",
    token,
)
assert dict(row) == {
    "recommendation": "recommended",
    "topic_label": "测试主题",
    "editing_note": "这段可以直接粗剪。",
    "boundary_reason": "从观点开始，到结论结束。",
    "needs_setup": False,
    "rejection_reason": "none",
}
audit_count = await conn.fetchval(
    "SELECT count(*) FROM highlight_window_scores WHERE project_token = $1",
    token,
)
assert audit_count == 1
```

- [ ] **Step 2: Run failing persistence tests**

Run:

```bash
cd services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest tests/test_candidate_persistence.py tests/test_pipeline_candidates.py -v
```

Expected: FAIL because persistence signature and SQL are old.

- [ ] **Step 3: Update candidate persistence signature**

Change:

```python
async def replace_project_candidates(
    database: Database,
    project_token: str,
    candidates: list[FinalCandidate],
    window_scores: list[WindowScoreAudit],
) -> None:
```

Inside the transaction, delete:

```sql
DELETE FROM highlight_window_scores WHERE project_token = $1
DELETE FROM clip_candidates WHERE project_token = $1
```

Insert final candidate columns:

```sql
recommendation, topic_label, editing_note, boundary_reason, needs_setup, rejection_reason
```

Insert values from `candidate`.

Insert `window_scores` rows with UUID IDs:

```sql
INSERT INTO highlight_window_scores (
  id, project_token, window_id, start_ms, end_ms, duration_ms,
  segment_ids, text_preview, recommendation, final_score, type,
  information_density, hook_strength, standalone_clarity, editability,
  rejection_reason, topic_label, recommendation_reason, selection_status,
  selection_reason, duplicate_of_window_id
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11,
  $12, $13, $14, $15,
  $16, $17, $18, $19,
  $20, $21
)
```

- [ ] **Step 4: Update Worker job pipeline call**

In `services/worker/clipwise_worker/pipeline.py`, where the generated candidates are persisted, change:

```python
result = await self._highlight_pipeline.generate(project_token, progress_callback)
await replace_project_candidates(
    self._database,
    project_token,
    result.candidates,
    result.window_scores,
)
```

- [ ] **Step 5: Run persistence tests**

Run the same pytest command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/worker/clipwise_worker/candidates.py \
  services/worker/clipwise_worker/pipeline.py \
  services/worker/tests/test_candidate_persistence.py \
  services/worker/tests/test_pipeline_candidates.py
git commit -m "feat: persist editor recall audits atomically"
```

---

## Task 8: Web UI for recommendation, topic, setup, and editor notes

**Files:**
- Modify: `apps/web/components/project/CandidateCard.tsx`
- Modify: `apps/web/components/project/CandidateCard.module.css`
- Modify: `apps/web/components/project/EditorTabs.tsx`
- Modify: `apps/web/tests/components` or existing component tests that render cards/editor tabs
- Modify: `apps/web/e2e/project-interactions.spec.ts` only if needed, without disturbing existing player bugfix assertions

- [ ] **Step 1: Write failing component expectations**

In the existing CandidateCard test file, or create one if absent, assert:

```tsx
expect(screen.getByText("强推荐")).toBeInTheDocument();
expect(screen.getByText("AI 项目报价")).toBeInTheDocument();
expect(screen.getByText("需要补开场")).toBeInTheDocument();
```

Use a candidate with:

```ts
recommendation: "strong",
topicLabel: "AI 项目报价",
needsSetup: true,
```

In the EditorTabs test, assert:

```tsx
expect(screen.getByText("剪辑建议")).toBeInTheDocument();
expect(screen.getByText("开头可补一句业务背景。")).toBeInTheDocument();
expect(screen.getByText("从完整观点开始，到结论结束。")).toBeInTheDocument();
```

- [ ] **Step 2: Run failing UI tests**

Run:

```bash
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run apps/web/tests/components
```

Expected: FAIL because UI does not show the new fields.

- [ ] **Step 3: Update CandidateCard**

Change import and label usage:

```tsx
<strong>{getRecommendationLevel(candidate.recommendation)}</strong>
```

Add metadata below the time:

```tsx
<div className={styles.editorMeta}>
  <span>{candidate.topicLabel}</span>
  {candidate.needsSetup && <span>需要补开场</span>}
</div>
```

- [ ] **Step 4: Update CandidateCard CSS**

Add:

```css
.editorMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.editorMeta span {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.92);
  color: #475569;
  font-size: 12px;
  padding: 3px 8px;
}
```

- [ ] **Step 5: Update EditorTabs read-only section**

Inside the existing read-only section, add:

```tsx
<h3>剪辑建议</h3>
<p>{candidate.editingNote || "暂无额外剪辑建议。"}</p>
<h3>边界说明</h3>
<p>{candidate.boundaryReason || "已按转写片段边界生成。"}</p>
{candidate.needsSetup && <p>这段需要剪辑师补充开场或借用前文上下文。</p>}
```

- [ ] **Step 6: Run UI tests**

Run the same Vitest command from Step 2.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/project/CandidateCard.tsx \
  apps/web/components/project/CandidateCard.module.css \
  apps/web/components/project/EditorTabs.tsx \
  apps/web/tests/components
git commit -m "feat: show editor recall guidance in project UI"
```

---

## Task 9: Human-label holdout dataset scaffold

**Files:**
- Create: `datasets/editor-recall-labels/README.md`
- Create: `datasets/editor-recall-labels/examples.jsonl`
- Modify: `findings.md`

- [ ] **Step 1: Create README**

Add `datasets/editor-recall-labels/README.md`:

```markdown
# Editor Recall Labels

This folder stores human editor labels used to calibrate Phase 5.1 recall.

Each JSONL row describes one human judgement over a source video time range.
Labels are not used as production mocks and must not be loaded by the Worker
candidate generation path.

## Schema

- `source`: stable sample identifier or livestream title.
- `startMs`: original video start time in milliseconds.
- `endMs`: original video end time in milliseconds.
- `label`: `keep`, `maybe`, or `reject`.
- `idealStartMs`: editor-preferred start time.
- `idealEndMs`: editor-preferred end time.
- `topicLabel`: short topic label.
- `editorNote`: why an editor would keep or reject this range.
- `rejectReason`: one Phase 5.1 rejection reason, or `none`.
```

- [ ] **Step 2: Create examples**

Add `datasets/editor-recall-labels/examples.jsonl`:

```jsonl
{"source":"sample-ai-livestream","startMs":120000,"endMs":240000,"label":"keep","idealStartMs":128000,"idealEndMs":232000,"topicLabel":"AI 项目报价","editorNote":"有判断标准和可复述结论，值得剪。","rejectReason":"none"}
{"source":"sample-ai-livestream","startMs":360000,"endMs":420000,"label":"reject","idealStartMs":360000,"idealEndMs":420000,"topicLabel":"直播转场","editorNote":"主要是寒暄和转场，没有独立内容价值。","rejectReason":"transition"}
```

- [ ] **Step 3: Record finding**

Append to `findings.md`:

```markdown
- Phase 5.1 人工标注留出集路径为 `datasets/editor-recall-labels/`；该数据只用于后续校准，不得被 Worker 生产候选路径作为 mock 或 fallback 读取。
```

- [ ] **Step 4: Commit**

```bash
git add datasets/editor-recall-labels/README.md datasets/editor-recall-labels/examples.jsonl findings.md
git commit -m "docs: add editor recall label dataset contract"
```

---

## Task 10: End-to-end verification and documentation

**Files:**
- Modify: `docs/phase-5-verification.md`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: Run Worker full tests**

Run:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek/services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run pytest -q
```

Expected: all Worker tests pass.

- [ ] **Step 2: Run Web unit/integration tests**

Run:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run --exclude 'tests/integration/**'

DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
  pnpm --filter @clipwise/web exec vitest run \
  tests/integration/create-to-ready.test.ts \
  tests/integration/sse-flow.test.ts
```

Expected: all listed Web tests pass.

- [ ] **Step 3: Run lint, build, and migration drift check**

Run:

```bash
pnpm lint
DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' pnpm build
pnpm db:generate
git diff --check
```

Expected: lint/build pass; `git diff --check` has no output; `pnpm db:generate` does not create unexpected migration drift.

- [ ] **Step 4: Run no-mock production audit**

Run:

```bash
rg -n "generate_mock_candidates|MOCK_CANDIDATES|mock_ai" \
  services/worker/clipwise_worker apps/web/app apps/web/lib
```

Expected: no output and `rg` exit 1, meaning no production-path matches.

- [ ] **Step 5: Run real 8-minute video validation**

Start or confirm services:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek
pnpm db:up

DATABASE_URL='postgres://clipwise:clipwise_dev@localhost:5432/clipwise' \
STORAGE_ROOT='/Users/chk/Documents/Codex/2026-06-22/z-g/storage' \
PROJECT_RETENTION_DAYS=7 \
SHORT_CLIP_RETENTION_HOURS=24 \
pnpm --filter @clipwise/web dev
```

Worker:

```bash
cd /Users/chk/Documents/Codex/2026-06-22/z-g/.worktrees/phase5-deepseek/services/worker
env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy \
  -u HTTPS_PROXY -u https_proxy -u NO_PROXY -u no_proxy \
  uv run python -m clipwise_worker.main
```

Upload `/Users/chk/Downloads/飞书20260623-131141.mp4` through the web page, not by direct MP4 upload to Groq.

Expected:

- Project becomes `ready`.
- Candidate count is natural for 8 minutes and may be below 30.
- Each candidate has `recommendation`, `topicLabel`, `editingNote`, `boundaryReason`, `needsSetup`, `rejectionReason`.
- `highlight_window_scores` row count equals generated window count for that project.
- No full original MP4 is uploaded to the server.

- [ ] **Step 6: Update verification docs**

Append a Phase 5.1 section to `docs/phase-5-verification.md` with:

```markdown
## Phase 5.1 Editor Recall Verification

- Worker tests: PASS, command and count.
- Web tests: PASS, command and count.
- Lint/build/migration drift: PASS.
- No mock production audit: PASS.
- Real 8-minute upload: PASS, project token prefix, candidate count, window score count.
- Known gap: 3h complete chunking remains Phase 4.1; 30 MP4 local export remains Phase 6.1.
```

Update `task_plan.md` Phase 5.1 checkboxes and `progress.md` latest session log.

- [ ] **Step 7: Commit**

```bash
git add docs/phase-5-verification.md task_plan.md progress.md
git commit -m "docs: verify phase 5.1 editor recall"
```

---

## Self-Review Checklist

- Spec coverage:
  - Recommendation tiers: Task 2, Task 3, Task 5, Task 8.
  - 4+1 scoring dimensions: Task 3, Task 4, Task 6, Task 7.
  - Editor fields: Task 2, Task 6, Task 7, Task 8.
  - Window score persistence: Task 1, Task 7, Task 10.
  - Topic diversity: Task 4, Task 6.
  - No fake mock fallback: Task 10.
  - Human label scaffold: Task 9.
- Type consistency:
  - Python uses snake_case internally with Pydantic aliases for DeepSeek camelCase.
  - TypeScript uses camelCase.
  - Database uses snake_case.
- Scope boundary:
  - Phase 4.1 long-video chunking remains outside this plan.
  - Phase 6.1 local 30-MP4 export remains outside this plan.
  - Existing player bugfix files are excluded from Phase 5.1 commits.
