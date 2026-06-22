import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { GET } from "@/app/api/tasks/[taskId]/route";
import { db, schema } from "@/db/client";

describe("GET /api/tasks/:taskId", () => {
  it("返回 TaskProgressEvent 结构", async () => {
    const taskId = "test-task-get-1";
    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, taskId));
    await db.insert(schema.jobs).values({
      taskId,
      type: "generate_candidates",
      status: "running",
      progress: 50,
      message: "正在分析内容",
    });

    const request = new Request(`http://localhost/api/tasks/${taskId}`);
    const response = await GET(request, { params: Promise.resolve({ taskId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.taskId).toBe(taskId);
    expect(body.status).toBe("running");
    expect(body.progress).toBe(50);
    expect(body.message).toBe("正在分析内容");
    expect(body.updatedAt).toBeDefined();

    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, taskId));
  });

  it("不存在的 taskId 返回 404", async () => {
    const request = new Request("http://localhost/api/tasks/nonexistent");
    const response = await GET(request, {
      params: Promise.resolve({ taskId: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });
});
