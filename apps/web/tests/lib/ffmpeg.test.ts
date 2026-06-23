import { describe, it, expect } from "vitest";
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
