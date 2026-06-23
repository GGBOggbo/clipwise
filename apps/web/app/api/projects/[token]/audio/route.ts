import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { db, schema } from "@/db/client";

// 用绝对路径，保证 Worker（不同 cwd）能通过 project_files.storagePath 找到文件
const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT ?? "./storage");

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

  const chunkIndex = Number(formData.get("chunkIndex") ?? "0");
  const startOffsetMs = Number(formData.get("startOffsetMs") ?? "0");
  const isLastChunk = formData.get("isLastChunk") === "true";

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
