import { describe, expect, it } from "vitest";
import { validateVideoFile } from "@/lib/file-validation";

describe("validateVideoFile", () => {
  it("拒绝非 MP4 文件", () => {
    const file = new File(["x"], "直播.mov", { type: "video/quicktime" });

    expect(validateVideoFile(file)).toEqual({
      ok: false,
      code: "unsupported_format",
      message: "目前只支持 MP4 回放视频。",
    });
  });

  it("拒绝超过 2GB 的文件", () => {
    const file = {
      name: "直播.mp4",
      type: "video/mp4",
      size: 2_147_483_649,
    } as File;

    expect(validateVideoFile(file).code).toBe("file_too_large");
  });

  it("接受 2GB 以内的 MP4", () => {
    const file = new File(["video"], "直播.mp4", { type: "video/mp4" });

    expect(validateVideoFile(file).ok).toBe(true);
  });
});
