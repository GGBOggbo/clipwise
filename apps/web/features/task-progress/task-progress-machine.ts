import type { jobs } from "@/db/schema";

type TaskStatus = typeof jobs.$inferSelect.status;

export function shouldAdvanceProgress(
  currentProgress: number,
  incomingProgress: number,
): boolean {
  return incomingProgress > currentProgress;
}

export function isTerminal(status: TaskStatus): boolean {
  return status === "succeeded" || status === "failed";
}

export function isCompleted(status: TaskStatus): boolean {
  return status === "succeeded";
}

export function isFailed(status: TaskStatus): boolean {
  return status === "failed";
}
