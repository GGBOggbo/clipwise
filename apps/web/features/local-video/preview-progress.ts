import type { PreviewStatus } from "@clipwise/shared";

export function getPreviewStatus(
  playedMs: number,
  durationMs: number,
): PreviewStatus {
  if (playedMs <= 0 || durationMs <= 0) return "not_previewed";
  return playedMs / durationMs >= 0.8 ? "previewed" : "previewing";
}
