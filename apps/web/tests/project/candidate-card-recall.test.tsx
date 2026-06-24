import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidateCard } from "@/components/project/CandidateCard";
import type { ClipCandidate } from "@clipwise/shared";

function makeCandidate(
  overrides: Partial<ClipCandidate> = {},
): ClipCandidate {
  return {
    id: "c-recall",
    rank: 1,
    finalScore: 88,
    type: "方法",
    startMs: 0,
    endMs: 120_000,
    durationMs: 120_000,
    titleOptions: ["标题一", "标题二", "标题三"],
    selectedTitle: "标题一",
    summary: "摘要",
    quote: "金句",
    recommendationReason: "理由",
    riskNotices: [],
    subtitles: [],
    previewStatus: "not_previewed",
    exportedAt: null,
    recommendation: "recommended",
    topicLabel: "AI 项目报价",
    editingNote: "可直接粗剪。",
    boundaryReason: "覆盖完整观点",
    needsSetup: false,
    rejectionReason: "none",
    ...overrides,
  };
}

function renderCard(candidate: ClipCandidate) {
  render(
    <CandidateCard
      candidate={candidate}
      selected={false}
      expanded={false}
      onSelect={() => {}}
      onPreview={() => {}}
      onToggleDetails={() => {}}
    />,
  );
}

describe("候选卡片编辑师召回字段", () => {
  it("展示强推荐档位、主题标签和需要补开场标记", () => {
    renderCard(
      makeCandidate({
        recommendation: "strong",
        topicLabel: "AI 项目报价",
        needsSetup: true,
      }),
    );

    expect(screen.getByText("强推荐")).toBeInTheDocument();
    expect(screen.getByText("AI 项目报价")).toBeInTheDocument();
    expect(screen.getByText("需要补开场")).toBeInTheDocument();
  });

  it("普通推荐展示为推荐，且不显示补开场标记", () => {
    renderCard(makeCandidate({ recommendation: "recommended", needsSetup: false }));

    expect(screen.getByText("推荐")).toBeInTheDocument();
    expect(screen.queryByText("需要补开场")).not.toBeInTheDocument();
  });

  it("展开详情时展示主题标签", async () => {
    const { rerender } = render(
      <CandidateCard
        candidate={makeCandidate({ topicLabel: "需求验证" })}
        selected={false}
        expanded={true}
        onSelect={() => {}}
        onPreview={() => {}}
        onToggleDetails={() => {}}
      />,
    );
    expect(screen.getByText("需求验证")).toBeInTheDocument();
    // rerender 保持引用稳定，避免 lint unused
    void rerender;
  });
});
