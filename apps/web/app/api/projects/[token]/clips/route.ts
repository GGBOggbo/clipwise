import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { mapRowToProject } from "@/features/project-mapping";

export async function GET(
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

  const candidates = await db
    .select()
    .from(schema.clipCandidates)
    .where(eq(schema.clipCandidates.projectToken, token));

  const candidateIds = candidates.map((c) => c.id);
  const subtitles =
    candidateIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.subtitleLines)
          .where(inArray(schema.subtitleLines.candidateId, candidateIds));

  const fullProject = mapRowToProject({ project, candidates, subtitles });
  return NextResponse.json(fullProject.candidates);
}
