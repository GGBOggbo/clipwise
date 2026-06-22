import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.taskId, taskId));
  if (!job) {
    return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    taskId: job.taskId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    updatedAt: job.updatedAt.toISOString(),
  });
}
