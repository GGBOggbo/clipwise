import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/projects/[token]/clips/route";

describe("GET /api/projects/:token/clips", () => {
  it("demo-project 返回 7 个候选（不含 project 元数据）", async () => {
    const request = new Request("http://localhost/api/projects/demo-project/clips");
    const response = await GET(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(200);
    const clips = await response.json();
    expect(Array.isArray(clips)).toBe(true);
    expect(clips).toHaveLength(7);
    expect(clips[0]).toHaveProperty("finalScore");
    expect(clips[0]).toHaveProperty("titleOptions");
    expect(clips[0]).toMatchObject({
      recommendation: "recommended",
      topicLabel: expect.any(String),
      editingNote: expect.any(String),
      boundaryReason: expect.any(String),
      needsSetup: false,
      rejectionReason: "none",
    });
    expect(clips[0]).not.toHaveProperty("status");
  });

  it("不存在的 token 返回 404", async () => {
    const request = new Request("http://localhost/api/projects/nonexistent/clips");
    const response = await GET(request, {
      params: Promise.resolve({ token: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });
});
