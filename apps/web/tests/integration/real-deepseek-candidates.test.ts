// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

const API_BASE = process.env.INTEGRATION_API_BASE ?? "http://localhost:3000";
const PROJECT_TOKEN = process.env.REAL_DEEPSEEK_PROJECT_TOKEN;
const SHOULD_RUN =
  process.env.RUN_REAL_DEEPSEEK === "1" && Boolean(PROJECT_TOKEN);

describe.skipIf(!SHOULD_RUN)("端到端：真实 DeepSeek 候选生成", () => {
  it(
    "真实 transcript → DeepSeek → 1–10 个可溯源候选",
    async () => {
      const projectToken = PROJECT_TOKEN!;
      const taskId = randomUUID();
      const transcript = await db
        .select()
        .from(schema.transcriptSegments)
        .where(eq(schema.transcriptSegments.projectToken, projectToken));
      expect(transcript.length).toBeGreaterThan(0);

      await db.insert(schema.jobs).values({
        taskId,
        projectToken,
        type: "generate_candidates",
        status: "pending",
        progress: 0,
        message: "等待开始",
      });
      await db
        .update(schema.projects)
        .set({ status: "analyzing", updatedAt: new Date() })
        .where(eq(schema.projects.token, projectToken));

      let status = "pending";
      for (let attempt = 0; attempt < 180; attempt++) {
        const response = await fetch(`${API_BASE}/api/tasks/${taskId}`);
        const task = (await response.json()) as {
          status: string;
          message: string;
        };
        status = task.status;
        if (status === "succeeded" || status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      expect(status).toBe("succeeded");

      const response = await fetch(
        `${API_BASE}/api/projects/${projectToken}/clips`,
      );
      const clips = (await response.json()) as Array<{
        id: string;
        rank: number;
        finalScore: number;
        startMs: number;
        endMs: number;
        quote: string;
        subtitles: Array<{ startMs: number; endMs: number; text: string }>;
      }>;
      expect(clips.length).toBeGreaterThanOrEqual(1);
      expect(clips.length).toBeLessThanOrEqual(10);
      expect(new Set(clips.map((clip) => clip.id)).size).toBe(clips.length);

      for (const clip of clips) {
        expect(clip.finalScore).toBeGreaterThanOrEqual(60);
        expect(clip.subtitles.length).toBeGreaterThan(0);
        expect(clip.startMs).toBe(clip.subtitles[0].startMs);
        expect(clip.endMs).toBe(
          clip.subtitles[clip.subtitles.length - 1].endMs,
        );
        const text = clip.subtitles.map((line) => line.text).join(" ");
        const normalize = (value: string) =>
          value.replace(/[ \t\r\n\u3000]+/g, "");
        expect(normalize(text)).toContain(normalize(clip.quote));
      }
    },
    400000,
  );
});
