import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { POST } from "@/app/api/projects/[token]/regenerate/route";
import { db, schema } from "@/db/client";

describe("POST /api/projects/:token/regenerate", () => {
  const createdProjectTokens: string[] = [];

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

  afterEach(async () => {
    for (const token of createdProjectTokens.splice(0)) {
      await db.delete(schema.projects).where(eq(schema.projects.token, token));
    }
  });

  async function createFailedProject() {
    const token = `retry-${randomUUID()}`;
    createdProjectTokens.push(token);
    await db.insert(schema.projects).values({
      token,
      status: "failed",
      sourceFileName: "直播回放.mp4",
      sourceFileSize: 1024,
      durationMs: 90_000,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      regenerationCount: 0,
    });
    return token;
  }

  it("失败项目已有 transcript 时只从候选生成重试", async () => {
    const token = await createFailedProject();
    await db.insert(schema.transcriptSegments).values({
      id: `${token}-seg-1`,
      projectToken: token,
      index: 0,
      startMs: 0,
      endMs: 10_000,
      text: "这是一段已经识别好的直播文本。",
    });

    const request = new Request(`http://localhost/api/projects/${token}/regenerate`, {
      method: "POST",
    });
    const response = await POST(request, {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.retryFrom).toBe("candidates");

    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.taskId, body.taskId));
    expect(job.type).toBe("generate_candidates");

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.token, token));
    expect(project.status).toBe("analyzing");
    expect(project.regenerationCount).toBe(0);
  });

  it("失败项目没有 transcript 但仍有音频块时从语音识别重试", async () => {
    const token = await createFailedProject();
    await db.insert(schema.projectFiles).values({
      id: `${token}-audio-1`,
      projectToken: token,
      kind: "compressed_audio",
      storagePath: `/tmp/${token}.mp3`,
      sizeBytes: 128,
      chunkIndex: 0,
      startOffsetMs: 0,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const request = new Request(`http://localhost/api/projects/${token}/regenerate`, {
      method: "POST",
    });
    const response = await POST(request, {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.retryFrom).toBe("transcription");

    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.taskId, body.taskId));
    expect(job.type).toBe("transcribe_audio");

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.token, token));
    expect(project.status).toBe("transcribing");
    expect(project.regenerationCount).toBe(0);
  });

  it("失败项目没有可恢复中间产物时要求重新上传", async () => {
    const token = await createFailedProject();

    const request = new Request(`http://localhost/api/projects/${token}/regenerate`, {
      method: "POST",
    });
    const response = await POST(request, {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("retry_not_available");
    expect(body.retryFrom).toBe("upload");
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
