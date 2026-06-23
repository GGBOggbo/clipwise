// @vitest-environment node
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/tasks/[taskId]/events/route";
import { db, schema } from "@/db/client";

function parseSSEEvents(chunk: string) {
  return chunk
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const event: Record<string, string> = {};
      for (const line of block.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          event[line.slice(0, colonIdx)] = line.slice(colonIdx + 1).trimStart();
        }
      }
      return event;
    });
}

describe("GET /api/tasks/:taskId/events (SSE)", () => {
  it("返回 text/event-stream 内容类型", async () => {
    const taskId = "sse-content-type-test";
    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, taskId));
    await db.insert(schema.jobs).values({
      taskId,
      type: "generate_candidates",
      status: "succeeded",
      progress: 100,
      message: "候选生成完成",
    });

    const request = new Request(
      "http://localhost/api/tasks/sse-content-type-test/events",
    );
    const resp = await GET(request, {
      params: Promise.resolve({ taskId }),
    });
    expect(resp.headers.get("content-type")).toContain("text/event-stream");
    await resp.body?.cancel();
  });

  it("succeeded 任务立即推送 completed 事件并关闭", async () => {
    const taskId = "sse-completed-test";
    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, taskId));
    await db.insert(schema.jobs).values({
      taskId,
      type: "generate_candidates",
      status: "succeeded",
      progress: 100,
      message: "候选生成完成",
    });

    const request = new Request(
      "http://localhost/api/tasks/sse-completed-test/events",
    );
    const resp = await GET(request, {
      params: Promise.resolve({ taskId }),
    });
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    const events: Record<string, string>[] = [];
    while (events.length === 0) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      const parsed = parseSSEEvents(accumulated);
      if (parsed.length > 0) {
        events.push(...parsed);
        break;
      }
    }
    await reader.cancel();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const finalEvent = events[events.length - 1];
    expect(finalEvent.event).toBe("completed");
    const data = JSON.parse(finalEvent.data);
    expect(data.status).toBe("succeeded");
    expect(data.progress).toBe(100);
  });

  it("不存在的 taskId 返回 404", async () => {
    const request = new Request(
      "http://localhost/api/tasks/nonexistent-sse/events",
    );
    const resp = await GET(request, {
      params: Promise.resolve({ taskId: "nonexistent-sse" }),
    });
    expect(resp.status).toBe(404);
  });
});
