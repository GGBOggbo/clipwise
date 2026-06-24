import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

const POLL_INTERVAL_MS = 1000;

type JobRow = {
  taskId: string;
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  message: string | null;
  errorCode: string | null;
  updatedAt: Date;
};

async function readJob(taskId: string): Promise<JobRow | null> {
  const [row] = await db
    .select({
      taskId: schema.jobs.taskId,
      status: schema.jobs.status,
      progress: schema.jobs.progress,
      message: schema.jobs.message,
      errorCode: schema.jobs.errorCode,
      updatedAt: schema.jobs.updatedAt,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.taskId, taskId));
  return row ?? null;
}

function buildEvent(job: JobRow) {
  const eventName =
    job.status === "succeeded"
      ? "completed"
      : job.status === "failed"
        ? "failed"
        : "progress";
  const payload = {
    taskId: job.taskId,
    status: job.status,
    progress: job.progress,
    message: job.message ?? "",
    errorCode: job.errorCode,
    updatedAt: job.updatedAt.toISOString(),
  };
  const id = job.updatedAt.getTime().toString();
  return `id: ${id}\nevent: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const existing = await readJob(taskId);
  if (!existing) {
    return new Response(JSON.stringify({ error: "task_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSignature = "";
      const push = (job: JobRow) => {
        const signature = `${job.status}:${job.progress}:${job.message}:${job.updatedAt.getTime()}`;
        if (signature !== lastSignature) {
          controller.enqueue(encoder.encode(buildEvent(job)));
          lastSignature = signature;
        }
      };

      // 立即推一帧首屏
      const initial = await readJob(taskId);
      if (!initial) {
        controller.close();
        return;
      }
      push(initial);
      if (initial.status === "succeeded" || initial.status === "failed") {
        controller.close();
        return;
      }

      // 每秒轮询直到终态；客户端断连时退出，避免连接泄漏
      while (!request.signal.aborted) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        const job = await readJob(taskId);
        if (!job) {
          controller.close();
          return;
        }
        push(job);
        if (job.status === "succeeded" || job.status === "failed") {
          controller.close();
          return;
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
