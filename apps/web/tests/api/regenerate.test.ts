import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/projects/[token]/regenerate/route";
import { db, schema } from "@/db/client";

describe("POST /api/projects/:token/regenerate", () => {
  // 测试会让 demo-project 的 regenerationCount 增长，结束后重置
  afterAll(async () => {
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
