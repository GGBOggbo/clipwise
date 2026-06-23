"use client";

import { useRouter } from "next/navigation";
import { useTaskProgress } from "@/features/task-progress/useTaskProgress";
import styles from "./Editor.module.css";

type Initial = {
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
};

type Props = {
  taskId: string;
  projectToken: string;
  initial: Initial;
};

export function TaskProgressClient({ taskId, projectToken, initial }: Props) {
  const router = useRouter();
  const state = useTaskProgress({
    taskId,
    projectToken,
    onCompleted: (token) => {
      router.push(`/project/${token}`);
    },
  });

  const isFailed = state.status === "failed";
  const progress = state.progress;

  return (
    <div className={styles.stateView}>
      <h1>{isFailed ? "处理失败" : state.message}</h1>
      {!isFailed && (
        <>
          <progress
            aria-label="任务进度"
            max={100}
            role="progressbar"
            value={progress}
            aria-valuenow={progress}
          />
          <p>{progress}%</p>
        </>
      )}
      {isFailed && (
        <button
          type="button"
          onClick={() => router.push(`/project/${projectToken}`)}
        >
          重试
        </button>
      )}
    </div>
  );
}
