// @vitest-environment node
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

const API_BASE = process.env.INTEGRATION_API_BASE ?? "http://localhost:3000";

describe("端到端：SSE 任务进度流", () => {
  it(
    "SSE 推送进度直到 completed",
    async () => {
      // 1. 创建项目 + 上传音频
      const createResp = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "sse-test.mp4",
          fileSize: 1000,
          durationMs: 60000,
        }),
      });
      const { projectToken } = await createResp.json();

      const formData = new FormData();
      formData.append(
        "audio",
        new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
        "chunk.mp3",
      );
      const audioResp = await fetch(
        `${API_BASE}/api/projects/${projectToken}/audio`,
        { method: "POST", body: formData },
      );
      const { taskId } = await audioResp.json();

      try {
        // 2. 建立 SSE 连接
        const sseResp = await fetch(`${API_BASE}/api/tasks/${taskId}/events`, {
          headers: { Accept: "text/event-stream" },
        });
        expect(sseResp.headers.get("content-type")).toContain(
          "text/event-stream",
        );

        const reader = sseResp.body!.getReader();
        const decoder = new TextDecoder();
        let lastEvent: Record<string, string> | null = null;
        let eventCount = 0;
        const startTime = Date.now();

        while (Date.now() - startTime < 30000) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const events = chunk
            .split("\n\n")
            .filter((b) => b.trim())
            .map((b) => {
              const ev: Record<string, string> = {};
              for (const line of b.split("\n")) {
                const i = line.indexOf(":");
                if (i > 0) ev[line.slice(0, i)] = line.slice(i + 1).trimStart();
              }
              return ev;
            });
          for (const ev of events) {
            eventCount++;
            lastEvent = ev;
            if (ev.event === "completed") break;
          }
          if (lastEvent?.event === "completed") break;
        }
        await reader.cancel();

        expect(eventCount).toBeGreaterThan(0);
        expect(lastEvent?.event).toBe("completed");
        const finalData = JSON.parse(lastEvent!.data);
        expect(finalData.status).toBe("succeeded");
        expect(finalData.progress).toBe(100);

        // 3. completed 后拉一次 clips
        const clipsResp = await fetch(
          `${API_BASE}/api/projects/${projectToken}/clips`,
        );
        const clips = await clipsResp.json();
        expect(clips).toHaveLength(7);
      } finally {
        await db
          .delete(schema.projects)
          .where(eq(schema.projects.token, projectToken));
      }
    },
    40000,
  );
});
