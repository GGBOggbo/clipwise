export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export type FileValidationResult =
  | { ok: true; code: "valid"; message: "" }
  | {
      ok: false;
      code: "unsupported_format" | "file_too_large";
      message: string;
    };

export function validateVideoFile(file: File): FileValidationResult {
  const isMp4 =
    file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");

  if (!isMp4) {
    return {
      ok: false,
      code: "unsupported_format",
      message: "目前只支持 MP4 回放视频。",
    };
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      message: "文件不能超过 2GB。",
    };
  }

  return { ok: true, code: "valid", message: "" };
}
