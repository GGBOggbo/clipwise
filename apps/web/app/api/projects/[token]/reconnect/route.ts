import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body: { name?: string; size?: number; durationMs?: number } =
    await request.json();

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.token, token));
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const nameMatch = project.sourceFileName === body.name;
  const sizeMatch = project.sourceFileSize === body.size;
  const durationMatch = project.durationMs === body.durationMs;

  const videoConnectionStatus =
    nameMatch && sizeMatch && durationMatch ? "connected" : "mismatch";

  await db
    .update(schema.projects)
    .set({ videoConnectionStatus, updatedAt: new Date() })
    .where(eq(schema.projects.token, token));

  return NextResponse.json({ videoConnectionStatus });
}
