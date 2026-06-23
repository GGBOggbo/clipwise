// @vitest-environment node
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { db, schema } from "@/db/client";

const API_BASE = process.env.INTEGRATION_API_BASE ?? "http://localhost:3000";

// 用 outputs/ 里的真实测试视频（Groq 能直接处理 mp4 容器）
const TEST_VIDEO =
  "/Users/chk/Documents/Codex/2026-06-22/z-g/outputs/clipwise-test-video.mp4";

describe.skipIf(!existsSync(TEST_VIDEO))("端到端：真实上传 + Groq ASR", () => {
  it(
    "上传真实视频音频 → Groq 转写 → transcript_segments 有数据",
    async () => {
      // 1. 创建项目
      const createResp = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "clipwise-test-video.mp4",
          fileSize: 2700000,
          durationMs: 60000,
        }),
      });
      const { projectToken } = (await createResp.json()) as {
        projectToken: string;
      };

      try {
        // 2. 上传视频（绕过 ffmpeg.wasm，直接把视频当音频传，Groq 能处理 mp4）
        const audioBytes = readFileSync(TEST_VIDEO);
        const formData = new FormData();
        formData.append("audio", new Blob([audioBytes]), "chunk.mp3");
        formData.append("chunkIndex", "0");
        formData.append("startOffsetMs", "0");
        formData.append("isLastChunk", "true");

        const audioResp = await fetch(
          `${API_BASE}/api/projects/${projectToken}/audio`,
          { method: "POST", body: formData },
        );
        const { taskId } = (await audioResp.json()) as { taskId: string };

        // 3. 轮询 transcribe job 直到终态（真实 Groq 慢，最长 120s）
        let transcribeStatus = "pending";
        for (let i = 0; i < 60; i++) {
          const taskResp = await fetch(`${API_BASE}/api/tasks/${taskId}`);
          const task = (await taskResp.json()) as { status: string };
          transcribeStatus = task.status;
          if (transcribeStatus === "succeeded" || transcribeStatus === "failed")
            break;
          await new Promise((r) => setTimeout(r, 2000));
        }
        expect(transcribeStatus).toBe("succeeded");

        // 4. 验证 transcript_segments 真的有数据（证明 Groq 跑了）
        const segRows = await db
          .select({ id: schema.transcriptSegments.id })
          .from(schema.transcriptSegments)
          .where(eq(schema.transcriptSegments.projectToken, projectToken));
        expect(segRows.length).toBeGreaterThan(0);
      } finally {
        await db
          .delete(schema.projects)
          .where(eq(schema.projects.token, projectToken));
      }
    },
    180000,
  );
});
