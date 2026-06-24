import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/projects/route";
import { db, schema } from "@/db/client";

describe("POST /api/projects", () => {
  afterAll(async () => {
    await db
      .update(schema.projects)
      .set({ regenerationCount: 0 })
      .where(eq(schema.projects.token, "demo-project"));
  });

  it("创建项目并返回 projectToken", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({ fileName: "test.mp4", fileSize: 1000, durationMs: 60000 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.projectToken).toBeDefined();
    expect(typeof body.projectToken).toBe("string");
    expect(body.projectToken.length).toBeGreaterThanOrEqual(32);

    await db
      .delete(schema.projects)
      .where(eq(schema.projects.token, body.projectToken));
  });

  it("缺少必需字段返回 400", async () => {
    const request = new Request("http://localhost/api/projects", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
