import { notFound, redirect } from "next/navigation";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { ApiProjectProvider } from "@/lib/api-project-provider";
import { findLatestTaskIdByProjectToken } from "@/lib/task-lookup";
import type { ClipwiseProject } from "@clipwise/shared";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const provider = new ApiProjectProvider();
  let project: ClipwiseProject;

  try {
    project = await provider.getProject(token);
  } catch {
    notFound();
  }

  // 非 ready 且有进行中的任务，跳任务页看进度
  if (project.status !== "ready" && project.status !== "expired") {
    const taskId = await findLatestTaskIdByProjectToken(token);
    if (taskId) {
      redirect(`/project/${token}/tasks/${taskId}`);
    }
  }

  return <ProjectWorkspace initialProject={project} />;
}
