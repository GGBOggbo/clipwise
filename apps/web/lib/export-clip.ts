import type { ClipCandidate, SubtitleLine } from "@clipwise/shared";

/**
 * 把毫秒转成 SRT 时间码 HH:MM:SS,mmm。
 */
function formatSrtTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = clamped % 1000;
  return (
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")},` +
    `${String(millis).padStart(3, "0")}`
  );
}

/**
 * 生成标准 SRT 字幕内容。
 *
 * subtitles 的 startMs/endMs 是源视频的绝对时间；
 * clipStartMs 是当前片段在源视频中的起点。
 * 输出的时间码是相对片段起点的（减去 clipStartMs），
 * 落在片段范围之外的字幕会被跳过。
 */
export function buildSrtContent(
  subtitles: SubtitleLine[],
  clipStartMs: number,
): string {
  const inside = subtitles.filter(
    (s) => s.endMs > clipStartMs && s.startMs >= clipStartMs,
  );
  if (inside.length === 0) return "";

  const blocks: string[] = [];
  inside.forEach((subtitle, index) => {
    const start = subtitle.startMs - clipStartMs;
    const end = subtitle.endMs - clipStartMs;
    blocks.push(
      [
        String(index + 1),
        `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
        subtitle.text,
        "",
      ].join("\n"),
    );
  });
  return blocks.join("\n");
}

/**
 * 生成 TXT 文案：标题 + 摘要 + 金句。
 */
export function buildTxtContent(candidate: ClipCandidate): string {
  return [
    candidate.selectedTitle,
    "",
    candidate.summary,
    "",
    `金句：${candidate.quote}`,
    "",
  ].join("\n");
}

/**
 * 去掉文件名非法字符（Windows/macOS/Linux 通用）。
 */
function sanitizeFileNameSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "").trim();
}

/**
 * 生成片段文件名：`{rank:02d}-{标题}.{ext}`。
 * rank 前缀保证 TOP5 批量导出时的顺序稳定。
 */
export function buildClipFileName(
  rank: number,
  selectedTitle: string,
  ext: string,
): string {
  return `${buildClipStem(rank, selectedTitle)}.${ext}`;
}

/**
 * 生成片段文件名主干（无扩展名）：`{rank:02d}-{标题}`。
 * 给需要自己拼扩展名的调用方用，避免 slice hack。
 */
export function buildClipStem(rank: number, selectedTitle: string): string {
  const safeTitle = sanitizeFileNameSegment(selectedTitle);
  return `${String(rank).padStart(2, "0")}-${safeTitle}`;
}
