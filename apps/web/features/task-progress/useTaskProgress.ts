"use client";

import { useEffect, useRef, useState } from "react";
import {
  shouldAdvanceProgress,
  isCompleted,
  isFailed,
} from "./task-progress-machine";

export type TaskProgressState = {
  status: "pending" | "running" | "succeeded" | "failed";
  progress: number;
  message: string;
  errorCode: string | null;
  isPolling: boolean;
};

type UseTaskProgressOptions = {
  taskId: string;
  projectToken: string;
  onCompleted: (token: string) => void;
  onFailed?: (errorCode: string | null) => void;
  silenceThresholdMs?: number;
  pollIntervalMs?: number;
};

const DEFAULT_SILENCE_THRESHOLD_MS = 8000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const POLL_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function useTaskProgress({
  taskId,
  projectToken,
  onCompleted,
  onFailed,
  silenceThresholdMs = DEFAULT_SILENCE_THRESHOLD_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseTaskProgressOptions): TaskProgressState {
  const [state, setState] = useState<TaskProgressState>({
    status: "pending",
    progress: 0,
    message: "等待开始",
    errorCode: null,
    isPolling: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageAtRef = useRef<number>(Date.now());
  const completedFiredRef = useRef(false);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;

  const applyEvent = (data: {
    status: TaskProgressState["status"];
    progress: number;
    message: string;
    errorCode?: string | null;
  }) => {
    setState((prev) => {
      const nextProgress = shouldAdvanceProgress(prev.progress, data.progress)
        ? data.progress
        : prev.progress;
      return {
        ...prev,
        status: data.status,
        progress: nextProgress,
        message: data.message,
        errorCode: data.errorCode ?? null,
      };
    });
  };

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setState((prev) => ({ ...prev, isPolling: false }));
  };

  const closeStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const startPolling = () => {
    if (pollTimerRef.current) return;
    setState((prev) => ({ ...prev, isPolling: true }));
    const poll = async () => {
      try {
        const resp = await fetch(`${POLL_BASE}/api/tasks/${taskId}`);
        if (!resp.ok) return;
        const data = await resp.json();
        lastMessageAtRef.current = Date.now();
        applyEvent(data);
        if (isCompleted(data.status)) {
          stopPolling();
          closeStream();
          if (!completedFiredRef.current) {
            completedFiredRef.current = true;
            onCompletedRef.current(projectToken);
          }
        } else if (isFailed(data.status)) {
          stopPolling();
          closeStream();
          onFailedRef.current?.(data.errorCode ?? null);
        }
      } catch {
        // 网络错误，等下个周期重试
      }
    };
    void poll();
    pollTimerRef.current = setInterval(poll, pollIntervalMs);
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (!pollTimerRef.current) startPolling();
    }, silenceThresholdMs);
  };

  useEffect(() => {
    const url = `${POLL_BASE}/api/tasks/${taskId}/events`;
    const es = new EventSource(url);
    eventSourceRef.current = es;
    lastMessageAtRef.current = Date.now();
    resetSilenceTimer();

    es.addEventListener("progress", (e: MessageEvent) => {
      lastMessageAtRef.current = Date.now();
      resetSilenceTimer();
      if (pollTimerRef.current) stopPolling();
      const data = JSON.parse(e.data);
      applyEvent(data);
    });

    es.addEventListener("completed", (e: MessageEvent) => {
      lastMessageAtRef.current = Date.now();
      const data = JSON.parse(e.data);
      applyEvent(data);
      stopPolling();
      closeStream();
      if (!completedFiredRef.current) {
        completedFiredRef.current = true;
        onCompletedRef.current(projectToken);
      }
    });

    es.addEventListener("failed", (e: MessageEvent) => {
      lastMessageAtRef.current = Date.now();
      const data = JSON.parse(e.data);
      applyEvent(data);
      stopPolling();
      closeStream();
      onFailedRef.current?.(data.errorCode ?? null);
    });

    es.addEventListener("error", () => {
      // EventSource 会自动重连；静默定时器会在持续无消息时启用轮询
    });

    const handleOnline = () => {
      if (Date.now() - lastMessageAtRef.current > silenceThresholdMs) {
        startPolling();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastMessageAtRef.current > silenceThresholdMs) {
          startPolling();
        }
      }
    };
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      closeStream();
      stopPolling();
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return state;
}
