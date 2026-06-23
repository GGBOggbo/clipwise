import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/projects/[token]/regenerate/route";
import { db, schema } from "@/db/client";

describe("POST /api/projects/:token/regenerate", () => {
  // 测试会让 demo-project 的 regenerationCount 增长并创建 job。
  // Worker 后台会领取这些 job 并调 mock_ai 删除重插候选，
  // 导致跨测试数据竞态。afterAll 重置 project 状态并清理测试 job。
  afterAll(async () => {
    await db
      .delete(schema.jobs)
      .where(eq(schema.jobs.projectToken, "demo-project"));
    await db
      .update(schema.projects)
      .set({ regenerationCount: 0, status: "ready" })
      .where(eq(schema.projects.token, "demo-project"));
  });

  it("首次重新生成返回新 taskId", async () => {
    // 先确保 demo-project 处于可重新生成状态
    await db
      .update(schema.projects)
      .set({ regenerationCount: 0 })
      .where(eq(schema.projects.token, "demo-project"));

    const request = new Request("http://localhost/api/projects/demo-project/regenerate", {
      method: "POST",
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.taskId).toBeDefined();

    // 立即删除刚创建的 job，防止后台 Worker 领取后调 mock_ai 删候选造成跨测试污染
    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, body.taskId));
  });

  it("超过 1 次重新生成返回 409", async () => {
    const request = new Request("http://localhost/api/projects/demo-project/regenerate", {
      method: "POST",
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("regeneration_limit_reached");
  });
});
