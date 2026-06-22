CREATE TYPE "public"."clip_type" AS ENUM('观点', '方法', '案例', '避坑', '对比', '总结', '金句');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('transcribe_audio', 'generate_candidates', 'regenerate_candidates', 'burn_subtitles', 'cleanup_expired_files');--> statement-breakpoint
CREATE TYPE "public"."preview_status" AS ENUM('not_previewed', 'previewing', 'previewed');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('waiting_for_video', 'extracting_audio', 'uploading_audio', 'transcribing', 'analyzing', 'ready', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."video_connection_status" AS ENUM('missing', 'checking', 'connected', 'mismatch', 'unsupported');--> statement-breakpoint
CREATE TABLE "clip_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_token" text NOT NULL,
	"rank" integer NOT NULL,
	"final_score" integer NOT NULL,
	"type" "clip_type" NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"duration_ms" bigint NOT NULL,
	"title_options" text[] NOT NULL,
	"selected_title" text NOT NULL,
	"summary" text NOT NULL,
	"quote" text NOT NULL,
	"recommendation_reason" text NOT NULL,
	"risk_notices" text[] DEFAULT '{}' NOT NULL,
	"preview_status" "preview_status" DEFAULT 'not_previewed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"task_id" text PRIMARY KEY NOT NULL,
	"project_token" text,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_files" (
	"id" text PRIMARY KEY NOT NULL,
	"project_token" text NOT NULL,
	"kind" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"token" text PRIMARY KEY NOT NULL,
	"status" "project_status" DEFAULT 'waiting_for_video' NOT NULL,
	"video_connection_status" "video_connection_status" DEFAULT 'missing' NOT NULL,
	"source_file_name" text,
	"source_file_size" bigint,
	"duration_ms" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"regeneration_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subtitle_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"index" integer NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_token" text NOT NULL,
	"index" integer NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD CONSTRAINT "clip_candidates_project_token_projects_token_fk" FOREIGN KEY ("project_token") REFERENCES "public"."projects"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_artifacts" ADD CONSTRAINT "export_artifacts_candidate_id_clip_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."clip_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_token_projects_token_fk" FOREIGN KEY ("project_token") REFERENCES "public"."projects"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_project_token_projects_token_fk" FOREIGN KEY ("project_token") REFERENCES "public"."projects"("token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_lines" ADD CONSTRAINT "subtitle_lines_candidate_id_clip_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."clip_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_project_token_projects_token_fk" FOREIGN KEY ("project_token") REFERENCES "public"."projects"("token") ON DELETE cascade ON UPDATE no action;