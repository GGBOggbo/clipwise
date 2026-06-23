import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAudioExtraction } from "@/features/upload/use-audio-extraction";

// mock ffmpeg 模块（不真跑 wasm）
const mockCalculateChunks = vi.fn(() => [
  { startOffsetMs: 0, durationMs: 60000 },
]);
vi.mock("@/lib/ffmpeg", () => ({
  calculateChunks: (...args: unknown[]) => mockCalculateChunks(...args),
  probeVideoDurationMs: vi.fn().mockResolvedValue(7_200_000), // 2 小时
  getFFmpeg: vi.fn().mockResolvedValue({}),
  extractAudioChunks: vi
    .fn()
    .mockResolvedValue([new Blob(["fake"], { type: "audio/mpeg" })]),
}));

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.clearAllMocks();
});

describe("useAudioExtraction", () => {
  it("状态流转：idle → done", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.endsWith("/api/projects")) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ projectToken: "tok-1" }),
        });
      }
      // audio upload
      return Promise.resolve({
        ok: true,
        status: 202,
        json: async () => ({ projectToken: "tok-1", taskId: "task-1" }),
      });
    });

    const { result } = renderHook(() => useAudioExtraction());
    expect(result.current.phase).toBe("idle");

    const fakeFile = new File(["x"], "test.mp4", { type: "video/mp4" });
    await act(async () => {
      await result.current.start(fakeFile);
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("done");
    });
    expect(result.current.taskId).toBe("task-1");
    expect(result.current.projectToken).toBe("tok-1");
    // 关键：calculateChunks 拿到的是 probe 出的真实时长（2 小时），不是硬编码 20 分钟
    expect(mockCalculateChunks).toHaveBeenCalledWith(
      7_200_000,
      30 * 60 * 1000,
      30 * 1000,
    );
  });

  it("ffmpeg 失败时 phase=error", async () => {
    const { extractAudioChunks } = await import("@/lib/ffmpeg");
    vi.mocked(extractAudioChunks).mockRejectedValueOnce(
      new Error("wasm load failed"),
    );
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ projectToken: "tok-2" }),
    });

    const { result } = renderHook(() => useAudioExtraction());
    await act(async () => {
      await result.current.start(
        new File(["x"], "test.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toContain("wasm");
  });

  it("创建项目失败时 phase=error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useAudioExtraction());
    await act(async () => {
      await result.current.start(
        new File(["x"], "test.mp4", { type: "video/mp4" }),
      );
    });

    expect(result.current.phase).toBe("error");
  });
});
