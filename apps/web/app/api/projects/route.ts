import { NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { generateProjectToken } from "@/lib/token";

const RETENTION_DAYS = Number(process.env.PROJECT_RETENTION_DAYS ?? 7);

export async function POST(request: Request) {
  let body: { fileName?: string; fileSize?: number; durationMs?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !body.fileName ||
    typeof body.fileSize !== "number" ||
    typeof body.durationMs !== "number"
  ) {
    return NextResponse.json(
      { error: "missing_required_fields", required: ["fileName", "fileSize", "durationMs"] },
      { status: 400 },
    );
  }

  const token = generateProjectToken();
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(schema.projects).values({
    token,
    status: "waiting_for_video",
    videoConnectionStatus: "missing",
    sourceFileName: body.fileName,
    sourceFileSize: body.fileSize,
    durationMs: body.durationMs,
    expiresAt,
    regenerationCount: 0,
  });

  return NextResponse.json({ projectToken: token }, { status: 201 });
}
