import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";

export async function findLatestTaskIdByProjectToken(
  token: string,
): Promise<string | null> {
  const [job] = await db
    .select({ taskId: schema.jobs.taskId })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.projectToken, token),
        inArray(schema.jobs.status, ["pending", "running"]),
      ),
    )
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);
  return job?.taskId ?? null;
}
