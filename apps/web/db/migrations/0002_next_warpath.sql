CREATE TABLE "highlight_window_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"project_token" text NOT NULL,
	"window_id" text NOT NULL,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"duration_ms" bigint NOT NULL,
	"segment_ids" text[] NOT NULL,
	"text_preview" text NOT NULL,
	"recommendation" text NOT NULL,
	"final_score" integer NOT NULL,
	"type" "clip_type" NOT NULL,
	"information_density" integer NOT NULL,
	"hook_strength" integer NOT NULL,
	"standalone_clarity" integer NOT NULL,
	"editability" integer NOT NULL,
	"rejection_reason" text NOT NULL,
	"topic_label" text NOT NULL,
	"recommendation_reason" text NOT NULL,
	"selection_status" text NOT NULL,
	"selection_reason" text NOT NULL,
	"duplicate_of_window_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "recommendation" text DEFAULT 'recommended' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "topic_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "editing_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "boundary_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "needs_setup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "rejection_reason" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "highlight_window_scores" ADD CONSTRAINT "highlight_window_scores_project_token_projects_token_fk" FOREIGN KEY ("project_token") REFERENCES "public"."projects"("token") ON DELETE cascade ON UPDATE no action;