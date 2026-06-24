import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

/**
 * 标记候选为已导出（导出漏斗埋点）。
 *
 * 与编辑用的 PATCH 分开：导出是系统行为记录，不是用户改内容。
 * 只记录"被导出过"这一事实（exported_at 置为当前时间），幂等。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;

  const [candidate] = await db
    .select({ id: schema.clipCandidates.id })
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

  await db
    .update(schema.clipCandidates)
    .set({ exportedAt: new Date() })
    .where(eq(schema.clipCandidates.id, id));

  return NextResponse.json({ ok: true });
}
