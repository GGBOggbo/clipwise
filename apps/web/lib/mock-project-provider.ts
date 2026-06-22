import { mockReadyProject, type ClipwiseProject } from "@clipwise/shared";
import type { ProjectProvider } from "./project-provider";

function cloneProject(project: ClipwiseProject): ClipwiseProject {
  return structuredClone(project);
}

export const mockProjectProvider: ProjectProvider = {
  async getProject(token) {
    if (token !== mockReadyProject.token) {
      throw new Error("project_not_found");
    }

    return cloneProject(mockReadyProject);
  },
  async saveProject(project) {
    return cloneProject(project);
  },
};
