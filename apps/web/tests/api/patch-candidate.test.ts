import { describe, it, expect } from "vitest";
import { PATCH } from "@/app/api/projects/[token]/candidates/[id]/route";

const DEMO_FIRST = "为什么很多人做 AI 应用第一步就错了";

describe("PATCH /api/projects/:token/candidates/:id", () => {
  it("更新 selectedTitle 并返回更新后的候选", async () => {
    const request = new Request(
      "http://localhost/api/projects/demo-project/candidates/candidate-1",
      {
        method: "PATCH",
        body: JSON.stringify({ selectedTitle: "新标题" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ token: "demo-project", id: "candidate-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.selectedTitle).toBe("新标题");

    // 恢复：patch 回原始值
    await PATCH(
      new Request(
        "http://localhost/api/projects/demo-project/candidates/candidate-1",
        {
          method: "PATCH",
          body: JSON.stringify({ selectedTitle: DEMO_FIRST }),
        },
      ),
      { params: Promise.resolve({ token: "demo-project", id: "candidate-1" }) },
    );
  });

  it("不存在的候选返回 404", async () => {
    const request = new Request(
      "http://localhost/api/projects/demo-project/candidates/nonexistent",
      {
        method: "PATCH",
        body: JSON.stringify({ selectedTitle: "x" }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ token: "demo-project", id: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });
});
