// @vitest-environment node
import { describe, it, expect } from "vitest";
import { File } from "node:buffer";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/projects/[token]/audio/route";
import { db, schema } from "@/db/client";

describe("POST /api/projects/:token/audio", () => {
  it("最后一块上传返回 projectToken 和 taskId，并创建 transcribe_audio job", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);
    const formData = new FormData();
    formData.append(
      "audio",
      new File([audioBytes], "chunk.mp3", { type: "audio/mpeg" }),
    );
    formData.append("chunkIndex", "0");
    formData.append("startOffsetMs", "0");
    formData.append("isLastChunk", "true");

    const request = new Request(
      "http://localhost/api/projects/demo-project/audio",
      { method: "POST", body: formData },
    );
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.projectToken).toBe("demo-project");
    expect(body.taskId).toBeDefined();

    // 验证 job type 是 transcribe_audio（不是 generate_candidates）
    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.taskId, body.taskId));
    expect(job.type).toBe("transcribe_audio");

    // 清理测试创建的 job + project_file
    await db.delete(schema.jobs).where(eq(schema.jobs.taskId, body.taskId));
    await db
      .delete(schema.projectFiles)
      .where(eq(schema.projectFiles.projectToken, "demo-project"));
  });

  it("非最后一块只确认接收，不创建 job", async () => {
    const formData = new FormData();
    formData.append(
      "audio",
      new File([new Uint8Array([0])], "chunk.mp3", { type: "audio/mpeg" }),
    );
    formData.append("chunkIndex", "0");
    formData.append("startOffsetMs", "0");
    formData.append("isLastChunk", "false");

    const request = new Request(
      "http://localhost/api/projects/demo-project/audio",
      { method: "POST", body: formData },
    );
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.taskId).toBeUndefined();
    expect(body.chunkIndex).toBe(0);

    // 清理 project_file
    await db
      .delete(schema.projectFiles)
      .where(eq(schema.projectFiles.projectToken, "demo-project"));
  });

  it("不存在的 token 返回 404", async () => {
    const formData = new FormData();
    formData.append("audio", new File([new Uint8Array([0])], "x.mp3"));
    formData.append("isLastChunk", "true");
    const request = new Request(
      "http://localhost/api/projects/nonexistent/audio",
      { method: "POST", body: formData },
    );
    const response = await POST(request, {
      params: Promise.resolve({ token: "nonexistent" }),
    });
    expect(response.status).toBe(404);
  });

  it("缺少 audio 字段返回 400", async () => {
    const request = new Request(
      "http://localhost/api/projects/demo-project/audio",
      { method: "POST", body: new FormData() },
    );
    const response = await POST(request, {
      params: Promise.resolve({ token: "demo-project" }),
    });
    expect(response.status).toBe(400);
  });
});
