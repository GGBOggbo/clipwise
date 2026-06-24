import { eq, inArray } from "drizzle-orm";
import type { ClipwiseProject } from "@clipwise/shared";
import { db, schema } from "@/db/client";
import { mapRowToProject } from "@/features/project-mapping";

/**
 * 直接查库加载完整项目（含候选与字幕），供 Server Component 使用。
 *
 * 避免在服务端 fetch 自身 API route（那需要硬编码端口，端口冲突即 404）。
 * API route 复用同一函数，保证两端数据一致。
 */
export async function getProjectByToken(
  token: string,
): Promise<ClipwiseProject | null> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.token, token));
  if (!project) {
    return null;
  }

  const candidates = await db
    .select()
    .from(schema.clipCandidates)
    .where(eq(schema.clipCandidates.projectToken, token));

  const candidateIds = candidates.map((c) => c.id);
  const subtitleRows =
    candidateIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.subtitleLines)
          .where(inArray(schema.subtitleLines.candidateId, candidateIds));

  return mapRowToProject({ project, candidates, subtitles: subtitleRows });
}
