import type { ClipwiseProject } from "@clipwise/shared";
import type { ProjectProvider } from "./project-provider";

// Server Component 里用相对路径（Next.js 内部解析到自己的 route handler）；
// 客户端/测试用 NEXT_PUBLIC_API_BASE 绝对地址。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";

export class ApiProjectProvider implements ProjectProvider {
  async getProject(token: string): Promise<ClipwiseProject> {
    const response = await fetch(`${API_BASE}/api/projects/${token}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.status === 404) {
      throw new Error("project_not_found");
    }
    if (!response.ok) {
      throw new Error(`project_fetch_failed: ${response.status}`);
    }
    return response.json();
  }

  // Phase 2：saveProject 保持 no-op，与 mock 行为一致。
  // EditorTabs 的 save 回调接通在 Phase 3（配合 SSE 完成态）。
  // 真实实现会遍历 project.candidates 调用 PATCH /api/projects/:token/candidates/:id
  async saveProject(project: ClipwiseProject): Promise<ClipwiseProject> {
    return project;
  }
}
