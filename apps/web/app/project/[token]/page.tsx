import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { ApiProjectProvider } from "@/lib/api-project-provider";
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

  return <ProjectWorkspace initialProject={project} />;
}
