import { NextResponse } from "next/server";
import { getProjectByToken } from "@/lib/project-lookup";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const project = await getProjectByToken(token);
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  return NextResponse.json(project);
}
