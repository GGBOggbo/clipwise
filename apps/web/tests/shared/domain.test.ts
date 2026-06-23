import { describe, expect, it } from "vitest";
import {
  getRecommendationLevel,
  mockReadyProject,
  type ClipCandidate,
} from "@clipwise/shared";

describe("Clipwise 领域模型", () => {
  it("maps model recommendation tiers to Chinese labels", () => {
    expect(getRecommendationLevel("strong")).toBe("强推荐");
    expect(getRecommendationLevel("recommended")).toBe("推荐");
    expect(getRecommendationLevel("backup")).toBe("备选");
  });

  it("演示项目默认包含 5 个展示候选和 7 个总候选", () => {
    expect(mockReadyProject.candidates.slice(0, 5)).toHaveLength(5);
    expect(mockReadyProject.candidates).toHaveLength(7);
  });

  it("候选默认未预览", () => {
    const candidate: ClipCandidate = mockReadyProject.candidates[0];
    expect(candidate.previewStatus).toBe("not_previewed");
  });
});
