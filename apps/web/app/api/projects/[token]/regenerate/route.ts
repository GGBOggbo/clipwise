import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";

const MAX_REGENERATIONS = 1;

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

  return NextResponse.json({ taskId }, { status: 202 });
}
