import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

// 捕获 exec 参数 + 提供假 readFile 返回
function createFakeFFmpeg(): FFmpeg & { execArgs: string[][] } {
  const calls: string[][] = [];
  const files = new Map<string, Uint8Array>();
  const fake = {
    loaded: true,
    exec: vi.fn(async (args: string[]) => {
      calls.push([...args]);
      return 0;
    }),
    writeFile: vi.fn(async (name: string, data: Uint8Array) => {
      files.set(name, data);
    }),
    readFile: vi.fn(async (name: string) => {
      // 返回一个可识别的假 mp4 内容
      const enc = new TextEncoder();
      return enc.encode(`mp4:${name}`);
    }),
    deleteFile: vi.fn(async (name: string) => {
      files.delete(name);
    }),
    on: vi.fn(),
    load: vi.fn(async () => {}),
  };
  return Object.assign(fake as unknown as FFmpeg, { execArgs: calls });
}

// mock @ffmpeg/ffmpeg 的 FFmpeg 类，让 getFFmpeg 单例用我们的假实例
let fakeFFmpeg: ReturnType<typeof createFakeFFmpeg>;
vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    constructor() {
      fakeFFmpeg = createFakeFFmpeg();
      return fakeFFmpeg;
    }
  },
}));
vi.mock("@ffmpeg/util", () => ({
  fetchFile: vi.fn(async (f: File) => new Uint8Array(await f.arrayBuffer())),
  toBlobURL: vi.fn(async () => "blob:fake"),
}));

beforeEach(() => {
  // 每个测试前重置模块缓存，让 ffmpeg.ts 的单例重新创建
  vi.resetModules();
});

describe("sliceVideoClip", () => {
  it("用 -c copy 流拷贝按时间戳切片并返回 video/mp4 Blob", async () => {
    const { sliceVideoClip } = await import("@/lib/ffmpeg");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "直播.mp4", {
      type: "video/mp4",
    });

    const blob = await sliceVideoClip(file, 30_000, 90_000);

    // 返回 video/mp4 Blob
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("video/mp4");

    // exec 参数：应含 -c copy、-ss、-t、-avoid_negative_ts
    const execArgs = fakeFFmpeg.execArgs;
    expect(execArgs).toHaveLength(1);
    const args = execArgs[0];
    expect(args).toContain("-c");
    expect(args).toContain("copy");
    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("30");
    expect(args).toContain("-t");
    expect(args[args.indexOf("-t") + 1]).toBe("60");
    expect(args).toContain("-avoid_negative_ts");
  });

  it("写入输入文件并在切片后清理", async () => {
    const { sliceVideoClip } = await import("@/lib/ffmpeg");
    const file = new File([new Uint8Array([9, 9])], "v.mp4", {
      type: "video/mp4",
    });

    await sliceVideoClip(file, 0, 5_000);

    expect(fakeFFmpeg.writeFile).toHaveBeenCalled();
    expect(fakeFFmpeg.deleteFile).toHaveBeenCalled();
  });
});
