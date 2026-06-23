ALTER TABLE "project_files" ADD COLUMN "chunk_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_files" ADD COLUMN "start_offset_ms" bigint DEFAULT 0 NOT NULL;