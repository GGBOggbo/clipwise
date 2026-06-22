import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { db, schema } from "@/db/client";

const STORAGE_ROOT = process.env.STORAGE_ROOT ?? "./storage";

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

  const audioBuffer = Buffer.from(await audio.arrayBuffer());
  const taskId = randomUUID();
  const storageDir = join(STORAGE_ROOT, token);
  await mkdir(storageDir, { recursive: true });
  const storagePath = join(storageDir, `${taskId}.mp3`);
  await writeFile(storagePath, audioBuffer);

  await db.insert(schema.projectFiles).values({
    id: randomUUID(),
    projectToken: token,
    kind: "compressed_audio",
    storagePath,
    sizeBytes: audioBuffer.length,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await db.insert(schema.jobs).values({
    taskId,
    projectToken: token,
    type: "generate_candidates",
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
