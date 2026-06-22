import { describe, expect, it } from "vitest";
import { createFingerprintMetadata } from "@/features/local-video/file-fingerprint";

describe("createFingerprintMetadata", () => {
  it("包含文件名、大小和时长", () => {
    expect(
      createFingerprintMetadata(
        { name: "直播.mp4", size: 1024 } as File,
        7_200_000,
      ),
    ).toEqual({
      name: "直播.mp4",
      size: 1024,
      durationMs: 7_200_000,
    });
  });
});
