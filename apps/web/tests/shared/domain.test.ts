import { describe, expect, it } from "vitest";
import {
  getRecommendationLevel,
  mockReadyProject,
  type ClipCandidate,
} from "@clipwise/shared";

describe("Clipwise 领域模型", () => {
  it("按分数映射推荐等级", () => {
    expect(getRecommendationLevel(90)).toBe("强推荐");
    expect(getRecommendationLevel(75)).toBe("推荐");
    expect(getRecommendationLevel(59)).toBe("可选");
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
