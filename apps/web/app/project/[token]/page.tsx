import { notFound, redirect } from "next/navigation";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { getProjectByToken } from "@/lib/project-lookup";
import { findLatestTaskIdByProjectToken } from "@/lib/task-lookup";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // 直接查库而非 HTTP fetch 自身路由：避免硬编码端口导致跨端口 404。
  const project = await getProjectByToken(token);
  if (!project) {
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
