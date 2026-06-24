import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { TaskProgressClient } from "@/components/project/TaskProgressClient";

type Props = {
  params: Promise<{ token: string; taskId: string }>;
};

export default async function TaskPage({ params }: Props) {
  const { token, taskId } = await params;

  // 直接查库而非 HTTP fetch 自身路由：避免硬编码端口导致跨端口 404，
  // 也省一次 localhost 往返。客户端轮询仍走 /api/tasks。
  const [job] = await db
    .select({ status: schema.jobs.status })
    .from(schema.jobs)
    .where(eq(schema.jobs.taskId, taskId));
  if (!job) {
    notFound();
  }

  // 任务已完成，直接跳项目页（项目此时已 ready）
  if (job.status === "succeeded") {
    redirect(`/project/${token}`);
  }

  return <TaskProgressClient taskId={taskId} projectToken={token} />;
}
