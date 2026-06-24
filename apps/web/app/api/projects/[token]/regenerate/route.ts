import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";

const MAX_REGENERATIONS = 1;

async function hasTranscript(token: string) {
  const rows = await db
    .select({ id: schema.transcriptSegments.id })
    .from(schema.transcriptSegments)
    .where(eq(schema.transcriptSegments.projectToken, token))
    .limit(1);
  return rows.length > 0;
}

async function hasCompressedAudio(token: string) {
  const rows = await db
    .select({ id: schema.projectFiles.id })
    .from(schema.projectFiles)
    .where(
      and(
        eq(schema.projectFiles.projectToken, token),
        eq(schema.projectFiles.kind, "compressed_audio"),
      ),
    )
    .limit(1);
  return rows.length > 0;
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

  if (project.status === "failed") {
    const transcriptAvailable = await hasTranscript(token);
    const audioAvailable = transcriptAvailable
      ? false
      : await hasCompressedAudio(token);

    if (!transcriptAvailable && !audioAvailable) {
      return NextResponse.json(
        {
          error: "retry_not_available",
          retryFrom: "upload",
          message: "可恢复的音频或转写文本已不存在，请重新上传视频。",
        },
        { status: 409 },
      );
    }

    const taskId = randomUUID();
    await db.insert(schema.jobs).values({
      taskId,
      projectToken: token,
      type: transcriptAvailable ? "generate_candidates" : "transcribe_audio",
      status: "pending",
      progress: 0,
      message: "等待开始",
    });

    await db
      .update(schema.projects)
      .set({
        status: transcriptAvailable ? "analyzing" : "transcribing",
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.token, token));

    return NextResponse.json(
      {
        taskId,
        retryFrom: transcriptAvailable ? "candidates" : "transcription",
      },
      { status: 202 },
    );
  }

  if (project.regenerationCount >= MAX_REGENERATIONS) {
    return NextResponse.json(
      { error: "regeneration_limit_reached" },
      { status: 409 },
    );
  }

  const taskId = randomUUID();
  await db.insert(schema.jobs).values({
    taskId,
    projectToken: token,
    type: "regenerate_candidates",
    status: "pending",
    progress: 0,
    message: "等待开始",
  });

  await db
    .update(schema.projects)
    .set({
      regenerationCount: project.regenerationCount + 1,
      status: "analyzing",
      updatedAt: new Date(),
    })
    .where(eq(schema.projects.token, token));

  return NextResponse.json({ taskId, retryFrom: "candidates" }, { status: 202 });
}
