import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiProjectProvider } from "@/lib/api-project-provider";
import type { ClipwiseProject } from "@clipwise/shared";

describe("ApiProjectProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getProject 调用 /api/projects/:token 并返回 ClipwiseProject", async () => {
    const mockProject: ClipwiseProject = {
      token: "t1",
      status: "ready",
      videoConnectionStatus: "missing",
      sourceFileName: "x.mp4",
      sourceFileSize: 1,
      durationMs: 1000,
      expiresAt: "2026-06-29T00:00:00.000Z",
      regenerationCount: 0,
      candidates: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockProject,
      }),
    );

    const provider = new ApiProjectProvider();
    const result = await provider.getProject("t1");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/projects/t1",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(result).toEqual(mockProject);
  });

  it("getProject 收到 404 抛 project_not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "project_not_found" }),
      }),
    );

    const provider = new ApiProjectProvider();
    await expect(provider.getProject("missing")).rejects.toThrow(
      "project_not_found",
    );
  });

  it("saveProject 当前为 no-op 兼容（后续接通）", async () => {
    const provider = new ApiProjectProvider();
    const input = {
      token: "t1",
      status: "ready" as const,
      videoConnectionStatus: "missing" as const,
      sourceFileName: "x",
      sourceFileSize: 1,
      durationMs: 1,
      expiresAt: "2026-06-29T00:00:00.000Z",
      regenerationCount: 0,
      candidates: [],
    };
    const result = await provider.saveProject(input);
    expect(result).toEqual(input);
  });
});
