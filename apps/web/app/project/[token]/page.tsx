import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockProjectProvider } from "@/lib/mock-project-provider";
import type { ClipwiseProject } from "@clipwise/shared";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let project: ClipwiseProject;

  try {
    project = await mockProjectProvider.getProject(token);
  } catch {
    notFound();
  }

  return <ProjectWorkspace initialProject={project} />;
}
