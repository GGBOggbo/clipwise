import {
  pgTable,
  text,
  bigint,
  integer,
  timestamp,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";

export const projectStatusEnum = pgEnum("project_status", [
  "waiting_for_video",
  "extracting_audio",
  "uploading_audio",
  "transcribing",
  "analyzing",
  "ready",
  "failed",
  "expired",
]);

export const videoConnectionStatusEnum = pgEnum("video_connection_status", [
  "missing",
  "checking",
  "connected",
  "mismatch",
  "unsupported",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "transcribe_audio",
  "generate_candidates",
  "regenerate_candidates",
  "burn_subtitles",
  "cleanup_expired_files",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const clipTypeEnum = pgEnum("clip_type", [
  "观点",
  "方法",
  "案例",
  "避坑",
  "对比",
  "总结",
  "金句",
]);

export const previewStatusEnum = pgEnum("preview_status", [
  "not_previewed",
  "previewing",
  "previewed",
]);

export const projects = pgTable("projects", {
  token: text("token").primaryKey(),
  status: projectStatusEnum("status").notNull().default("waiting_for_video"),
  videoConnectionStatus: videoConnectionStatusEnum("video_connection_status")
    .notNull()
    .default("missing"),
  sourceFileName: text("source_file_name"),
  sourceFileSize: bigint("source_file_size", { mode: "number" }),
  durationMs: bigint("duration_ms", { mode: "number" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  regenerationCount: integer("regeneration_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectFiles = pgTable("project_files", {
  id: text("id").primaryKey(),
  projectToken: text("project_token")
    .notNull()
    .references(() => projects.token, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  storagePath: text("storage_path").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  startOffsetMs: bigint("start_offset_ms", { mode: "number" }).notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transcriptSegments = pgTable("transcript_segments", {
  id: text("id").primaryKey(),
  projectToken: text("project_token")
    .notNull()
    .references(() => projects.token, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  startMs: bigint("start_ms", { mode: "number" }).notNull(),
  endMs: bigint("end_ms", { mode: "number" }).notNull(),
  text: text("text").notNull(),
});

export const clipCandidates = pgTable("clip_candidates", {
  id: text("id").primaryKey(),
  projectToken: text("project_token")
    .notNull()
    .references(() => projects.token, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  finalScore: integer("final_score").notNull(),
  type: clipTypeEnum("type").notNull(),
  startMs: bigint("start_ms", { mode: "number" }).notNull(),
  endMs: bigint("end_ms", { mode: "number" }).notNull(),
  durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
  titleOptions: text("title_options").array().notNull(),
  selectedTitle: text("selected_title").notNull(),
  summary: text("summary").notNull(),
  quote: text("quote").notNull(),
  recommendationReason: text("recommendation_reason").notNull(),
  riskNotices: text("risk_notices").array().notNull().default([]),
  // Phase 5.1 editor recall：剪辑师视角的推荐档位与可读理由
  recommendation: text("recommendation").notNull().default("recommended"),
  topicLabel: text("topic_label").notNull().default(""),
  editingNote: text("editing_note").notNull().default(""),
  boundaryReason: text("boundary_reason").notNull().default(""),
  needsSetup: boolean("needs_setup").notNull().default(false),
  rejectionReason: text("rejection_reason").notNull().default("none"),
  previewStatus: previewStatusEnum("preview_status")
    .notNull()
    .default("not_previewed"),
});

export const subtitleLines = pgTable("subtitle_lines", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => clipCandidates.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  startMs: bigint("start_ms", { mode: "number" }).notNull(),
  endMs: bigint("end_ms", { mode: "number" }).notNull(),
  text: text("text").notNull(),
});

export const jobs = pgTable("jobs", {
  taskId: text("task_id").primaryKey(),
  projectToken: text("project_token").references(() => projects.token, {
    onDelete: "cascade",
  }),
  type: jobTypeEnum("type").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  message: text("message"),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Phase 5.1：每个被 DeepSeek 评过分的窗口都留痕（含被拒/去重/主题跳过）
export const highlightWindowScores = pgTable("highlight_window_scores", {
  id: text("id").primaryKey(),
  projectToken: text("project_token")
    .notNull()
    .references(() => projects.token, { onDelete: "cascade" }),
  windowId: text("window_id").notNull(),
  startMs: bigint("start_ms", { mode: "number" }).notNull(),
  endMs: bigint("end_ms", { mode: "number" }).notNull(),
  durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
  segmentIds: text("segment_ids").array().notNull(),
  textPreview: text("text_preview").notNull(),
  recommendation: text("recommendation").notNull(),
  finalScore: integer("final_score").notNull(),
  type: clipTypeEnum("type").notNull(),
  informationDensity: integer("information_density").notNull(),
  hookStrength: integer("hook_strength").notNull(),
  standaloneClarity: integer("standalone_clarity").notNull(),
  editability: integer("editability").notNull(),
  rejectionReason: text("rejection_reason").notNull(),
  topicLabel: text("topic_label").notNull(),
  recommendationReason: text("recommendation_reason").notNull(),
  selectionStatus: text("selection_status").notNull(),
  selectionReason: text("selection_reason").notNull(),
  duplicateOfWindowId: text("duplicate_of_window_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exportArtifacts = pgTable("export_artifacts", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => clipCandidates.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  storagePath: text("storage_path").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
