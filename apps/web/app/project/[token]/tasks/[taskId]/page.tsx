import { notFound, redirect } from "next/navigation";
import { TaskProgressClient } from "@/components/project/TaskProgressClient";

type Props = {
  params: Promise<{ token: string; taskId: string }>;
};

export default async function TaskPage({ params }: Props) {
  const { token, taskId } = await params;
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";

  const resp = await fetch(`${base}/api/tasks/${taskId}`, {
    cache: "no-store",
  });
  if (!resp.ok) {
    notFound();
  }
  const task = (await resp.json()) as {
    status: "pending" | "running" | "succeeded" | "failed";
  };

  // 任务已完成，直接跳项目页（项目此时已 ready）
  if (task.status === "succeeded") {
    redirect(`/project/${token}`);
  }

  return <TaskProgressClient taskId={taskId} projectToken={token} />;
}
