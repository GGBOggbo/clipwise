export type ProjectStatus =
  | "waiting_for_video"
  | "extracting_audio"
  | "uploading_audio"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "failed"
  | "expired";

export type VideoConnectionStatus =
  | "missing"
  | "checking"
  | "connected"
  | "mismatch"
  | "unsupported";

export type PreviewStatus =
  | "not_previewed"
  | "previewing"
  | "previewed";

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "failed";

export type ExportStatus =
  | "idle"
  | "confirming"
  | "preparing"
  | "exporting"
  | "completed"
  | "failed";

export type ClipType =
  | "观点"
  | "方法"
  | "案例"
  | "避坑"
  | "对比"
  | "总结"
  | "金句";

export type SubtitleLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type ClipCandidate = {
  id: string;
  rank: number;
  finalScore: number;
  type: ClipType;
  startMs: number;
  endMs: number;
  durationMs: number;
  titleOptions: [string, string, string];
  selectedTitle: string;
  summary: string;
  quote: string;
  recommendationReason: string;
  riskNotices: string[];
  subtitles: SubtitleLine[];
  previewStatus: PreviewStatus;
};

export type ClipwiseProject = {
  token: string;
  status: ProjectStatus;
  videoConnectionStatus: VideoConnectionStatus;
  sourceFileName: string;
  sourceFileSize: number;
  durationMs: number;
  expiresAt: string;
  regenerationCount: number;
  candidates: ClipCandidate[];
};

export function getRecommendationLevel(
  score: number,
): "强推荐" | "推荐" | "可选" {
  if (score >= 85) return "强推荐";
  if (score >= 65) return "推荐";
  return "可选";
}
