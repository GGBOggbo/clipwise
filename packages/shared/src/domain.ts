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

export type Recommendation = "strong" | "recommended" | "backup" | "reject";

export type RejectionReason =
  | "none"
  | "small_talk"
  | "transition"
  | "fragmented"
  | "duplicate"
  | "low_information"
  | "asr_noise"
  | "too_context_dependent"
  | "promotion_or_admin";

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
  /** 导出漏斗：被导出的时间戳（null = 未导出），用于判断推荐质量 */
  exportedAt: string | null;
  // Phase 5.1 editor recall：模型推荐档位与剪辑师可读字段
  recommendation: Recommendation;
  topicLabel: string;
  editingNote: string;
  boundaryReason: string;
  needsSetup: boolean;
  rejectionReason: RejectionReason;
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
  recommendation: Exclude<Recommendation, "reject">,
): "强推荐" | "推荐" | "备选" {
  if (recommendation === "strong") return "强推荐";
  if (recommendation === "recommended") return "推荐";
  return "备选";
}
