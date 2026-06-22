import { describe, expect, it } from "vitest";
import { getPreviewStatus } from "@/features/local-video/preview-progress";

describe("getPreviewStatus", () => {
  it("未播放时保持未预览", () => {
    expect(getPreviewStatus(0, 100_000)).toBe("not_previewed");
  });

  it("不足 80% 时保持预览中", () => {
    expect(getPreviewStatus(79_999, 100_000)).toBe("previewing");
  });

  it("达到 80% 时标记已预览", () => {
    expect(getPreviewStatus(80_000, 100_000)).toBe("previewed");
  });
});
