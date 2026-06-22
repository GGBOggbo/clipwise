import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

const EDITABLE_FIELDS = [
  "selectedTitle",
  "titleOptions",
  "summary",
  "quote",
  "riskNotices",
  "previewStatus",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;

  const body = await request.json();

  const [candidate] = await db
    .select()
    .from(schema.clipCandidates)
    .where(
      and(
        eq(schema.clipCandidates.id, id),
        eq(schema.clipCandidates.projectToken, token),
      ),
    );
  if (!candidate) {
    return NextResponse.json({ error: "candidate_not_found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      update[field] = body[field];
    }
  }

  if (body.subtitles && Array.isArray(body.subtitles)) {
    for (const s of body.subtitles) {
      if (s.id && typeof s.text === "string") {
        await db
          .update(schema.subtitleLines)
          .set({ text: s.text })
          .where(eq(schema.subtitleLines.id, s.id));
      }
    }
  }

  const [updated] =
    Object.keys(update).length === 0
      ? [candidate]
      : await db
          .update(schema.clipCandidates)
          .set(update)
          .where(eq(schema.clipCandidates.id, id))
          .returning();

  const subtitles = await db
    .select()
    .from(schema.subtitleLines)
    .where(eq(schema.subtitleLines.candidateId, id));

  return NextResponse.json({
    ...updated,
    titleOptions: [...updated.titleOptions],
    riskNotices: [...updated.riskNotices],
    subtitles: subtitles.map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
    })),
  });
}
