import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { findLatestTaskIdByProjectToken } from "@/lib/task-lookup";
import { db, schema } from "@/db/client";

describe("findLatestTaskIdByProjectToken", () => {
  it("返回项目最新的 pending/running 任务 id", async () => {
    const taskId = "lookup-test-task";
    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, taskId));
    await db.insert(schema.jobs).values({
      taskId,
      projectToken: "demo-project",
      type: "generate_candidates",
      status: "running",
      progress: 40,
      message: "正在分析内容",
    });

    const found = await findLatestTaskIdByProjectToken("demo-project");
    expect(found).toBe(taskId);

    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, taskId));
  });

  it("没有进行中的任务返回 null", async () => {
    const found = await findLatestTaskIdByProjectToken("nonexistent-token-xyz");
    expect(found).toBeNull();
  });
});
