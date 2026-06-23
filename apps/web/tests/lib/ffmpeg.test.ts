import { describe, it, expect, vi } from "vitest";
import { calculateChunks } from "@/lib/ffmpeg";

describe("calculateChunks", () => {
  it("2 小时视频分成 ~5 块（每块 30 分钟）", () => {
    const durationMs = 2 * 60 * 60 * 1000; // 2 小时
    const chunks = calculateChunks(durationMs, 30 * 60 * 1000, 30 * 1000);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks.length).toBeLessThanOrEqual(6);
  });

  it("每块的 startOffsetMs 正确（考虑 overlap）", () => {
    const chunks = calculateChunks(60 * 60 * 1000, 30 * 60 * 1000, 30 * 1000);
    // 第一块从 0 开始
    expect(chunks[0].startOffsetMs).toBe(0);
    // 第二块从 30min - 30s 开始
    expect(chunks[1].startOffsetMs).toBe(30 * 60 * 1000 - 30 * 1000);
  });

  it("短视频（< 30 分钟）只有 1 块", () => {
    const chunks = calculateChunks(20 * 60 * 1000, 30 * 60 * 1000, 30 * 1000);
    expect(chunks).toHaveLength(1);
  });

  it("每块的 durationMs 不超过 chunkDurationMs", () => {
    const chunks = calculateChunks(2 * 60 * 60 * 1000, 30 * 60 * 1000, 30 * 1000);
    for (const c of chunks) {
      expect(c.durationMs).toBeLessThanOrEqual(30 * 60 * 1000);
    }
  });

  it("边界情况：刚好等于 chunkDurationMs 时只有 1 块", () => {
    const chunks = calculateChunks(30 * 60 * 1000, 30 * 60 * 1000, 30 * 1000);
    expect(chunks).toHaveLength(1);
  });
});

describe("probeVideoDurationMs", () => {
  it("从 loadedmetadata 读取真实时长（秒转毫秒）", async () => {
    const { probeVideoDurationMs } = await import("@/lib/ffmpeg");

    // mock createElement 返回的 video 元素
    const videoEl = {
      duration: NaN,
      currentTime: 0,
      src: "",
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "loadedmetadata") {
          // 模拟 metadata 加载后填入时长
          videoEl.duration = 7200; // 2 小时（秒）
          queueMicrotask(handler);
        }
      }),
      removeEventListener: vi.fn(),
    };
    const originalCreate = document.createElement;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "video") return videoEl as unknown as HTMLVideoElement;
      return originalCreate.call(document, tag);
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    const durationMs = await probeVideoDurationMs(
      new File(["x"], "v.mp4", { type: "video/mp4" }),
    );

    expect(durationMs).toBe(7_200_000);
    document.createElement.mockRestore();
  });

  it("duration 为 Infinity 时走 seek 探测 fallback", async () => {
    const { probeVideoDurationMs } = await import("@/lib/ffmpeg");

    const timeUpdateHandlers: Array<() => void> = [];
    const videoEl = {
      duration: NaN,
      _currentTime: 0,
      get currentTime() {
        return this._currentTime;
      },
      set currentTime(v: number) {
        this._currentTime = v;
        // 模拟浏览器 seek 后触发 timeupdate，并把 currentTime 修正到真实尾部
        if (v > 1e100) {
          this._currentTime = 5400;
          queueMicrotask(() => timeUpdateHandlers.forEach((h) => h()));
        }
      },
      src: "",
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "loadedmetadata") {
          videoEl.duration = Infinity;
          queueMicrotask(handler);
        }
        if (event === "timeupdate") {
          timeUpdateHandlers.push(handler);
        }
      }),
      removeEventListener: vi.fn(),
    };
    const originalCreate = document.createElement;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "video") return videoEl as unknown as HTMLVideoElement;
      return originalCreate.call(document, tag);
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });

    const durationMs = await probeVideoDurationMs(
      new File(["x"], "v.mp4", { type: "video/mp4" }),
    );

    expect(durationMs).toBe(5_400_000);
    document.createElement.mockRestore();
  });
});
