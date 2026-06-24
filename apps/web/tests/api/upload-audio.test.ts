// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { File } from "node:buffer";
import { eq } from "drizzle-orm";
import { POST } from "@/app/api/projects/[token]/audio/route";
import { db, schema } from "@/db/client";

// 护栏测试用隔离 token，避免污染 demo-project 的累计统计
const GUARD_TOKEN = "guard-test-project";

async function seedGuardProject() {
  await db.insert(schema.projects).values({
    token: GUARD_TOKEN,
    status: "uploading_audio",
    videoConnectionStatus: "missing",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

async function cleanupGuardProject() {
  await db
    .delete(schema.projectFiles)
    .where(eq(schema.projectFiles.projectToken, GUARD_TOKEN));
  await db.delete(schema.jobs).where(eq(schema.jobs.projectToken, GUARD_TOKEN));
  await db.delete(schema.projects).where(eq(schema.projects.token, GUARD_TOKEN));
}

function audioRequest(
  token: string,
  size: number,
  opts: { chunkIndex?: number; isLastChunk?: boolean } = {},
) {
  const formData = new FormData();
  formData.append(
    "audio",
    new File([new Uint8Array(size)], "chunk.mp3", { type: "audio/mpeg" }),
  );
  formData.append("chunkIndex", String(opts.chunkIndex ?? 0));
  formData.append("startOffsetMs", "0");
  formData.append("isLastChunk", String(opts.isLastChunk ?? false));
  return new Request(`http://localhost/api/projects/${token}/audio`, {
    method: "POST",
    body: formData,
  });
}

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

// 护栏测试：资源约束，用注入的小阈值验证逻辑
describe("POST /api/projects/:token/audio 资源护栏", () => {
  beforeEach(async () => {
    // 单块 20、累计 15、最多 2 块：让单块能过但累计/数量会超
    process.env.UPLOAD_MAX_CHUNK_BYTES = String(20);
    process.env.UPLOAD_MAX_PROJECT_BYTES = String(15);
    process.env.UPLOAD_MAX_CHUNKS = String(2);
    await seedGuardProject();
  });

  afterEach(async () => {
    delete process.env.UPLOAD_MAX_CHUNK_BYTES;
    delete process.env.UPLOAD_MAX_PROJECT_BYTES;
    delete process.env.UPLOAD_MAX_CHUNKS;
    await cleanupGuardProject();
  });

  it("单块超过上限返回 413，不落盘", async () => {
    // 阈值 20 字节，传 21 字节
    const response = await POST(audioRequest(GUARD_TOKEN, 21), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe("chunk_too_large");

    const files = await db
      .select()
      .from(schema.projectFiles)
      .where(eq(schema.projectFiles.projectToken, GUARD_TOKEN));
    expect(files).toHaveLength(0);
  });

  it("chunk 总数超过上限返回 413", async () => {
    // 阈值 2 块：先传 chunk 0、chunk 1，再传 chunk 2 应被拒
    await POST(audioRequest(GUARD_TOKEN, 5, { chunkIndex: 0 }), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });
    await POST(audioRequest(GUARD_TOKEN, 5, { chunkIndex: 1 }), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });
    const response = await POST(audioRequest(GUARD_TOKEN, 5, { chunkIndex: 2 }), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error).toBe("too_many_chunks");
  });

  it("项目累计大小超过上限返回 413", async () => {
    // 单块阈值 20、累计阈值 15：第一块 11 通过，第二块 11+11=22 超累计
    const first = await POST(audioRequest(GUARD_TOKEN, 11, { chunkIndex: 0 }), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });
    expect(first.status).toBe(202);
    const second = await POST(
      audioRequest(GUARD_TOKEN, 11, { chunkIndex: 1 }),
      { params: Promise.resolve({ token: GUARD_TOKEN }) },
    );
    expect(second.status).toBe(413);
    const body = await second.json();
    expect(body.error).toBe("project_storage_exceeded");
  });

  it("同 chunkIndex 重传覆盖旧记录，而非新增", async () => {
    await POST(audioRequest(GUARD_TOKEN, 5, { chunkIndex: 0 }), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });
    await POST(audioRequest(GUARD_TOKEN, 6, { chunkIndex: 0 }), {
      params: Promise.resolve({ token: GUARD_TOKEN }),
    });

    const files = await db
      .select()
      .from(schema.projectFiles)
      .where(eq(schema.projectFiles.projectToken, GUARD_TOKEN));
    // 同 index 重传：仍只有 1 条记录，size 更新为 6
    expect(files).toHaveLength(1);
    expect(files[0].chunkIndex).toBe(0);
    expect(files[0].sizeBytes).toBe(6);
  });
});
