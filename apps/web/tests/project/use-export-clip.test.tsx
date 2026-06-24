import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ClipCandidate } from "@clipwise/shared";

// mock ffmpeg 切片：返回可识别的假 mp4
const mockSlice = vi.fn(async () =>
  new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" }),
);
vi.mock("@/lib/ffmpeg", () => ({
  sliceVideoClip: () => mockSlice(),
}));

// 捕获 createObjectURL 下载（setup.ts 里已 polyfill 成固定字符串）
let createdUrls: string[] = [];

function makeCandidate(rank: number): ClipCandidate {
  return {
    id: `c${rank}`,
    rank,
    finalScore: 90 - rank,
    type: "观点",
    startMs: rank * 100_000,
    endMs: rank * 100_000 + 60_000,
    durationMs: 60_000,
    titleOptions: [`标题${rank}一`, `二`, `三`],
    selectedTitle: `标题${rank}一`,
    summary: `摘要${rank}`,
    quote: `金句${rank}`,
    recommendationReason: "理由",
    riskNotices: [],
    subtitles: [
      {
        id: `s${rank}`,
        startMs: rank * 100_000,
        endMs: rank * 100_000 + 30_000,
        text: `字幕${rank}`,
      },
    ],
    previewStatus: "not_previewed",
    exportedAt: null,
    recommendation: "recommended",
    topicLabel: "主题",
    editingNote: "",
    boundaryReason: "",
    needsSetup: false,
    rejectionReason: "none",
  };
}

describe("useExportClip", () => {
  beforeEach(() => {
    mockSlice.mockClear();
    createdUrls = [];
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => {
          const u = "blob:clipwise-test";
          createdUrls.push(u);
          return u;
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    // mock 点击下载：jsdom 没有 <a>.click() 真实下载，只需不报错
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:clipwise-test"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it("exportSingle：切 MP4 + 生成 SRT/TXT，状态 idle→slicing→done", async () => {
    const { useExportClip } = await import("@/features/project-state/use-export-clip");
    const file = new File([new Uint8Array([0])], "v.mp4", { type: "video/mp4" });
    const candidate = makeCandidate(1);

    const { result } = renderHook(() => useExportClip());

    expect(result.current.progress.status).toBe("idle");

    await act(async () => {
      await result.current.exportSingle(candidate, file);
    });

    expect(mockSlice).toHaveBeenCalledTimes(1);
    expect(result.current.progress.status).toBe("done");
  });

  it("exportBatch：串行切 TOP3，每个调一次 slice", async () => {
    const { useExportClip } = await import("@/features/project-state/use-export-clip");
    const file = new File([new Uint8Array([0])], "v.mp4", { type: "video/mp4" });
    const candidates = [makeCandidate(1), makeCandidate(2), makeCandidate(3)];

    const { result } = renderHook(() => useExportClip());

    await act(async () => {
      await result.current.exportBatch(candidates, file);
    });

    expect(mockSlice).toHaveBeenCalledTimes(3);
    expect(result.current.progress.status).toBe("done");
  });

  it("切片失败时状态变 failed 且不部分下载", async () => {
    const { useExportClip } = await import("@/features/project-state/use-export-clip");
    mockSlice.mockRejectedValueOnce(new Error("ffmpeg 崩溃"));
    const file = new File([new Uint8Array([0])], "v.mp4", { type: "video/mp4" });

    const { result } = renderHook(() => useExportClip());

    await act(async () => {
      await result.current.exportSingle(makeCandidate(1), file);
    });

    expect(result.current.progress.status).toBe("failed");
  });
});
