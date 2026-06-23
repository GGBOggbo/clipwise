import { describe, it, expect, vi, beforeEach } from "vitest";
import { patchCandidate } from "@/lib/candidate-api";
import type { ClipCandidate } from "@clipwise/shared";

describe("patchCandidate", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("调用 PATCH /api/projects/:token/candidates/:id 并传可编辑字段", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const candidate: ClipCandidate = {
      id: "c1",
      rank: 1,
      finalScore: 90,
      type: "观点",
      startMs: 0,
      endMs: 5000,
      durationMs: 5000,
      titleOptions: ["a", "b", "c"],
      selectedTitle: "a",
      summary: "s",
      quote: "q",
      recommendationReason: "r",
      riskNotices: [],
      subtitles: [{ id: "sub-1", startMs: 0, endMs: 5000, text: "字幕" }],
      previewStatus: "not_previewed",
    };

    await patchCandidate("token-x", candidate);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/projects/token-x/candidates/c1",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.selectedTitle).toBe("a");
    expect(body.titleOptions).toEqual(["a", "b", "c"]);
    expect(body.summary).toBe("s");
    expect(body.subtitles).toEqual([{ id: "sub-1", text: "字幕" }]);
  });

  it("响应非 ok 时抛错", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const candidate = { id: "c1" } as ClipCandidate;
    await expect(patchCandidate("t", candidate)).rejects.toThrow();
  });
});
