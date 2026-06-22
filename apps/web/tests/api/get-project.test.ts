import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/projects/[token]/route";

describe("GET /api/projects/:token", () => {
  it("demo-project 返回完整 ClipwiseProject 含 7 候选", async () => {
    const request = new Request("http://localhost/api/projects/demo-project");
    const response = await GET(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(200);
    const project = await response.json();
    expect(project.token).toBe("demo-project");
    expect(project.candidates).toHaveLength(7);
    expect(project.candidates[0].titleOptions).toHaveLength(3);
    expect(project.candidates[0].subtitles[0]).toHaveProperty("startMs");
  });

  it("不存在的 token 返回 404 且 error=project_not_found", async () => {
    const request = new Request("http://localhost/api/projects/nonexistent");
    const response = await GET(request, {
      params: Promise.resolve({ token: "nonexistent" }),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("project_not_found");
  });
});
