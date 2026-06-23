// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

const API_BASE = process.env.INTEGRATION_API_BASE ?? "http://localhost:3000";

describe("端到端：SSE 任务进度流", () => {
  it(
    "SSE 推送数据库进度直到 completed",
    async () => {
      const createResp = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "sse-test.mp4",
          fileSize: 1000,
          durationMs: 60000,
        }),
      });
      const { projectToken } = (await createResp.json()) as {
        projectToken: string;
      };
      const taskId = randomUUID();
      await db.insert(schema.jobs).values({
        taskId,
        projectToken,
        type: "generate_candidates",
        status: "running",
        progress: 10,
        message: "正在读取转写",
      });

      try {
        const updater = (async () => {
          await new Promise((resolve) => setTimeout(resolve, 1100));
          await db
            .update(schema.jobs)
            .set({
              progress: 65,
              message: "正在筛选候选片段",
              updatedAt: new Date(),
            })
            .where(eq(schema.jobs.taskId, taskId));
          await new Promise((resolve) => setTimeout(resolve, 1100));
          await db
            .update(schema.jobs)
            .set({
              status: "succeeded",
              progress: 100,
              message: "候选生成完成",
              updatedAt: new Date(),
            })
            .where(eq(schema.jobs.taskId, taskId));
        })();

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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const events = chunk
            .split("\n\n")
            .filter((block) => block.trim())
            .map((block) => {
              const event: Record<string, string> = {};
              for (const line of block.split("\n")) {
                const separator = line.indexOf(":");
                if (separator > 0) {
                  event[line.slice(0, separator)] = line
                    .slice(separator + 1)
                    .trimStart();
                }
              }
              return event;
            });
          for (const event of events) {
            eventCount++;
            lastEvent = event;
          }
        }
        await updater;

        expect(eventCount).toBeGreaterThanOrEqual(2);
        expect(lastEvent?.event).toBe("completed");
        const finalData = JSON.parse(lastEvent!.data);
        expect(finalData.status).toBe("succeeded");
        expect(finalData.progress).toBe(100);
      } finally {
        await db
          .delete(schema.projects)
          .where(eq(schema.projects.token, projectToken));
      }
    },
    15000,
  );
});
