import { describe, expect, it } from "vitest";
import { requestExport } from "@/features/project-state/export-machine";

describe("requestExport", () => {
  it("未预览时进入确认状态", () => {
    expect(requestExport("not_previewed")).toBe("confirming");
  });

  it("已预览时直接进入准备状态", () => {
    expect(requestExport("previewed")).toBe("preparing");
  });
});
