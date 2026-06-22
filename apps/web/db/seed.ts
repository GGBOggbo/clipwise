import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { mockReadyProject } from "@clipwise/shared";
import { projects, clipCandidates, subtitleLines } from "./schema";

async function seed() {
  const queryClient = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(queryClient);

  // 清理旧的 demo 数据（幂等，可重复执行）
  await db.delete(projects).where(
    // drizzle 没有 ne，用 SQL 直接删 demo-project
    (await import("drizzle-orm")).sql`token = ${mockReadyProject.token}`,
  );

  await db.insert(projects).values({
    token: mockReadyProject.token,
    status: mockReadyProject.status,
    videoConnectionStatus: mockReadyProject.videoConnectionStatus,
    sourceFileName: mockReadyProject.sourceFileName,
    sourceFileSize: mockReadyProject.sourceFileSize,
    durationMs: mockReadyProject.durationMs,
    expiresAt: new Date(mockReadyProject.expiresAt),
    regenerationCount: mockReadyProject.regenerationCount,
  });

  for (const c of mockReadyProject.candidates) {
    await db.insert(clipCandidates).values({
      id: c.id,
      projectToken: mockReadyProject.token,
      rank: c.rank,
      finalScore: c.finalScore,
      type: c.type,
      startMs: c.startMs,
      endMs: c.endMs,
      durationMs: c.durationMs,
      titleOptions: [...c.titleOptions],
      selectedTitle: c.selectedTitle,
      summary: c.summary,
      quote: c.quote,
      recommendationReason: c.recommendationReason,
      riskNotices: [...c.riskNotices],
      previewStatus: c.previewStatus,
    });

    for (let i = 0; i < c.subtitles.length; i++) {
      const s = c.subtitles[i];
      await db.insert(subtitleLines).values({
        id: s.id,
        candidateId: c.id,
        index: i,
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
      });
    }
  }

  console.log(
    `Seeded ${mockReadyProject.token} with ${mockReadyProject.candidates.length} candidates`,
  );
  await queryClient.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
