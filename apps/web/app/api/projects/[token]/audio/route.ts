import { NextResponse } from "next/server";
import { eq, sum } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { db, schema } from "@/db/client";

// 用绝对路径，保证 Worker（不同 cwd）能通过 project_files.storagePath 找到文件
const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT ?? "./storage");

// 资源护栏默认值：写接口没有鉴权，必须自带额度，避免磁盘被灌爆。
// 30 分钟 MP3@128kbps ≈ 28MB，留余量设单块 100MB；一场 4 小时直播约 8 块。
// 在请求内读取 env，便于测试注入小值；生产用默认。
const DEFAULT_MAX_CHUNK_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_PROJECT_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_CHUNKS = 20;

function limits() {
  return {
    maxChunkBytes: Number(
      process.env.UPLOAD_MAX_CHUNK_BYTES ?? DEFAULT_MAX_CHUNK_BYTES,
    ),
    maxProjectBytes: Number(
      process.env.UPLOAD_MAX_PROJECT_BYTES ?? DEFAULT_MAX_PROJECT_BYTES,
    ),
    maxChunks: Number(process.env.UPLOAD_MAX_CHUNKS ?? DEFAULT_MAX_CHUNKS),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.token, token));
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "missing_audio_field" }, { status: 400 });
  }

  const { maxChunkBytes, maxProjectBytes, maxChunks } = limits();

  // 单块大小上限：在落盘前拦截，超限直接拒绝
  if (audio.size > maxChunkBytes) {
    return NextResponse.json(
      { error: "chunk_too_large", maxBytes: maxChunkBytes },
      { status: 413 },
    );
  }

  const chunkIndex = Number(formData.get("chunkIndex") ?? "0");
  const startOffsetMs = Number(formData.get("startOffsetMs") ?? "0");
  const isLastChunk = formData.get("isLastChunk") === "true";

  // chunk 总数上限：防止无限分块
  const existingFiles = await db
    .select({
      chunkIndex: schema.projectFiles.chunkIndex,
      id: schema.projectFiles.id,
      storagePath: schema.projectFiles.storagePath,
    })
    .from(schema.projectFiles)
    .where(eq(schema.projectFiles.projectToken, token));
  const isReplacing = existingFiles.some((f) => f.chunkIndex === chunkIndex);
  if (!isReplacing && existingFiles.length >= maxChunks) {
    return NextResponse.json(
      { error: "too_many_chunks", maxChunks },
      { status: 413 },
    );
  }

  // 项目累计大小上限：含当前块在内的总量不得超过上限
  const [aggregated] = await db
    .select({ total: sum(schema.projectFiles.sizeBytes) })
    .from(schema.projectFiles)
    .where(eq(schema.projectFiles.projectToken, token));
  const totalSoFar = Number(aggregated?.total ?? 0);
  if (totalSoFar + audio.size > maxProjectBytes) {
    return NextResponse.json(
      { error: "project_storage_exceeded", maxBytes: maxProjectBytes },
      { status: 413 },
    );
  }

  // chunkIndex 去重：同 index 重传覆盖旧文件 + 旧记录，而非新增
  const oldFile = existingFiles.find((f) => f.chunkIndex === chunkIndex);
  if (oldFile) {
    try {
      await unlink(oldFile.storagePath);
    } catch {
      // 旧文件可能已被清理，忽略删除失败
    }
    await db
      .delete(schema.projectFiles)
      .where(eq(schema.projectFiles.id, oldFile.id));
  }

  const audioBuffer = Buffer.from(await audio.arrayBuffer());
  const fileId = randomUUID();
  const storageDir = join(STORAGE_ROOT, token);
  await mkdir(storageDir, { recursive: true });
  const storagePath = join(storageDir, `${fileId}.mp3`);
  await writeFile(storagePath, audioBuffer);

  await db.insert(schema.projectFiles).values({
    id: fileId,
    projectToken: token,
    kind: "compressed_audio",
    storagePath,
    sizeBytes: audioBuffer.length,
    chunkIndex,
    startOffsetMs,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  // 只在最后一块时创建 transcribe job（前端控制 isLastChunk）
  if (isLastChunk) {
    const taskId = randomUUID();
    await db.insert(schema.jobs).values({
      taskId,
      projectToken: token,
      type: "transcribe_audio",
      status: "pending",
      progress: 0,
      message: "等待开始",
    });

    await db
      .update(schema.projects)
      .set({ status: "transcribing", updatedAt: new Date() })
      .where(eq(schema.projects.token, token));

    return NextResponse.json({ projectToken: token, taskId }, { status: 202 });
  }

  // 非最后一块：只确认接收，不创建 job
  return NextResponse.json(
    { projectToken: token, chunkIndex },
    { status: 202 },
  );
}
