// @vitest-environment node
import { describe, it, expect } from "vitest";
import { File } from "node:buffer";
import { POST } from "@/app/api/projects/[token]/audio/route";

describe("POST /api/projects/:token/audio", () => {
  it("demo-project 上传音频返回 projectToken 和 taskId", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);
    const formData = new FormData();
    formData.append(
      "audio",
      new File([audioBytes], "chunk.mp3", { type: "audio/mpeg" }),
    );

    const request = new Request("http://localhost/api/projects/demo-project/audio", {
      method: "POST",
      body: formData,
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.projectToken).toBe("demo-project");
    expect(body.taskId).toBeDefined();
    expect(typeof body.taskId).toBe("string");
  });

  it("不存在的 token 返回 404", async () => {
    const formData = new FormData();
    formData.append("audio", new File([new Uint8Array([0])], "x.mp3"));
    const request = new Request("http://localhost/api/projects/nonexistent/audio", {
      method: "POST",
      body: formData,
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });

  it("缺少 audio 字段返回 400", async () => {
    const request = new Request("http://localhost/api/projects/demo-project/audio", {
      method: "POST",
      body: new FormData(),
    });
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(400);
  });
});
