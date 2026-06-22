// @vitest-environment node
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { ApiProjectProvider } from "@/lib/api-project-provider";
import { db, schema } from "@/db/client";

const API_BASE = process.env.INTEGRATION_API_BASE ?? "http://localhost:3000";

describe("端到端：创建项目到候选就绪", () => {
  it(
    "完整链路跑通（需 Postgres + Worker 运行）",
    async () => {
      // 1. 创建项目
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
      const { projectToken } = await createResp.json();

      try {
        // 2. 上传音频（创建 job）
        const formData = new FormData();
        formData.append(
          "audio",
          new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
          "chunk.mp3",
        );
        const audioResp = await fetch(`${API_BASE}/api/projects/${projectToken}/audio`, {
          method: "POST",
          body: formData,
        });
        expect(audioResp.status).toBe(202);
        const { taskId } = await audioResp.json();

        // 3. 轮询任务直到 succeeded（Worker 串行处理，等几秒）
        let taskStatus = "pending";
        for (let i = 0; i < 30; i++) {
          const taskResp = await fetch(`${API_BASE}/api/tasks/${taskId}`);
          const task = await taskResp.json();
          taskStatus = task.status;
          if (taskStatus === "succeeded" || taskStatus === "failed") break;
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(taskStatus).toBe("succeeded");

        // 4. 拉取 clips
        const clipsResp = await fetch(`${API_BASE}/api/projects/${projectToken}/clips`);
        const clips = await clipsResp.json();
        expect(clips).toHaveLength(7);
        expect(clips[0].finalScore).toBeGreaterThanOrEqual(52);

        // 5. 通过 ApiProjectProvider 读到就绪项目
        const provider = new ApiProjectProvider();
        const project = await provider.getProject(projectToken);
        expect(project.status).toBe("ready");
        expect(project.candidates).toHaveLength(7);
      } finally {
        // 清理：用 DB 直连（ON DELETE CASCADE 级联删候选/字幕）
        await db.delete(schema.projects).where(eq(schema.projects.token, projectToken));
      }
    },
    30000,
  );
});
