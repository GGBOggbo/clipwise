import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/projects/[token]/reconnect/route";

describe("POST /api/projects/:token/reconnect", () => {
  it("指纹完全匹配返回 connected", async () => {
    const request = new Request("http://localhost/api/projects/demo-project/reconnect", {
      method: "POST",
      body: JSON.stringify({
        name: "AI产品需求验证直播回放.mp4",
        size: 1_280_000_000,
        durationMs: 6_180_000,
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.videoConnectionStatus).toBe("connected");
  });

  it("文件大小不符返回 mismatch", async () => {
    const request = new Request("http://localhost/api/projects/demo-project/reconnect", {
      method: "POST",
      body: JSON.stringify({
        name: "AI产品需求验证直播回放.mp4",
        size: 999,
        durationMs: 6_180_000,
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.videoConnectionStatus).toBe("mismatch");
  });

  it("不存在的 token 返回 404", async () => {
    const request = new Request("http://localhost/api/projects/nonexistent/reconnect", {
      method: "POST",
      body: JSON.stringify({ name: "x", size: 1, durationMs: 1 }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });
});
