import { describe, expect, it } from "vitest";
import { mockProjectProvider } from "@/lib/mock-project-provider";

describe("mockProjectProvider", () => {
  it("按 token 返回项目副本", async () => {
    const project = await mockProjectProvider.getProject("demo-project");

    expect(project.token).toBe("demo-project");
    expect(project.candidates).toHaveLength(7);
  });

  it("未知 token 抛出明确错误", async () => {
    await expect(mockProjectProvider.getProject("missing")).rejects.toThrow(
      "project_not_found",
    );
  });
});
