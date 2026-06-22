import type { ClipwiseProject } from "@clipwise/shared";

export interface ProjectProvider {
  getProject(token: string): Promise<ClipwiseProject>;
  saveProject(project: ClipwiseProject): Promise<ClipwiseProject>;
}
