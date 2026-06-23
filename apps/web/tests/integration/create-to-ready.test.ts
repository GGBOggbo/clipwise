// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ApiProjectProvider } from "@/lib/api-project-provider";
import { db, schema } from "@/db/client";

const API_BASE = process.env.INTEGRATION_API_BASE ?? "http://localhost:3000";

describe("端到端：创建项目到候选就绪", () => {
  it("API 可以读取数据库中的真实候选结构", async () => {
    const createResp = await fetch(`${API_BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "integration-test.mp4",
        fileSize: 1000,
        durationMs: 60000,
      }),
    });
    expect(createResp.status).toBe(201);
    const { projectToken } = (await createResp.json()) as {
      projectToken: string;
    };
    const candidateId = `${projectToken}-${randomUUID()}`;

    try {
      await db.insert(schema.clipCandidates).values({
        id: candidateId,
        projectToken,
        rank: 1,
        finalScore: 88,
        type: "观点",
        startMs: 0,
        endMs: 60000,
        durationMs: 60000,
        titleOptions: ["真实标题一", "真实标题二", "真实标题三"],
        selectedTitle: "真实标题一",
        summary: "由受控集成数据构造的摘要",
        quote: "真实转写原文",
        recommendationReason: "观点完整",
        riskNotices: [],
        previewStatus: "not_previewed",
      });
      await db.insert(schema.subtitleLines).values({
        id: randomUUID(),
        candidateId,
        index: 0,
        startMs: 0,
        endMs: 60000,
        text: "真实转写原文",
      });
      await db
        .update(schema.projects)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(schema.projects.token, projectToken));

      const clipsResp = await fetch(
        `${API_BASE}/api/projects/${projectToken}/clips`,
      );
      const clips = await clipsResp.json();
      expect(clips).toHaveLength(1);
      expect(clips[0].selectedTitle).toBe("真实标题一");
      expect(clips[0].subtitles[0].text).toBe("真实转写原文");

      const provider = new ApiProjectProvider();
      const project = await provider.getProject(projectToken);
      expect(project.status).toBe("ready");
      expect(project.candidates).toHaveLength(1);
    } finally {
      await db
        .delete(schema.projects)
        .where(eq(schema.projects.token, projectToken));
    }
  });
});
