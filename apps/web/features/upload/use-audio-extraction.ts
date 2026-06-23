"use client";

import { useState, useCallback } from "react";
import {
  calculateChunks,
  extractAudioChunks,
  getFFmpeg,
} from "@/lib/ffmpeg";

export type ExtractionPhase =
  | "idle"
  | "creating-project"
  | "loading-ffmpeg"
  | "extracting"
  | "uploading"
  | "done"
  | "error";

const CHUNK_DURATION_MS = 30 * 60 * 1000;
const OVERLAP_MS = 30 * 1000;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function useAudioExtraction() {
  const [phase, setPhase] = useState<ExtractionPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [projectToken, setProjectToken] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const start = useCallback(async (file: File) => {
    setError(null);
    setProgress(0);

    try {
      // 1. 创建项目
      setPhase("creating-project");
      const createResp = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          durationMs: 0, // TODO: 从 <video> 读真实 duration，Phase 4 后期补
        }),
      });
      if (!createResp.ok) {
        throw new Error(`create_project_failed: ${createResp.status}`);
      }
      const { projectToken } = (await createResp.json()) as {
        projectToken: string;
      };
      setProjectToken(projectToken);

      // 2. 加载 ffmpeg + 提取音频
      setPhase("loading-ffmpeg");
      await getFFmpeg();
      setPhase("extracting");
      // durationMs 未知时按 30 分钟内估算（短视频只切 1 块）
      const assumedDurationMs = 20 * 60 * 1000;
      const chunks = calculateChunks(
        assumedDurationMs,
        CHUNK_DURATION_MS,
        OVERLAP_MS,
      );
      const audioBlobs = await extractAudioChunks(file, chunks, (r) =>
        setProgress(r),
      );

      // 3. 分块上传
      setPhase("uploading");
      setProgress(0);
      let lastTaskId: string | null = null;
      for (let i = 0; i < audioBlobs.length; i++) {
        const formData = new FormData();
        formData.append("audio", audioBlobs[i], `chunk_${i}.mp3`);
        formData.append("chunkIndex", String(i));
        formData.append("startOffsetMs", String(chunks[i].startOffsetMs));
        formData.append(
          "isLastChunk",
          String(i === audioBlobs.length - 1),
        );

        const resp = await fetch(
          `${API_BASE}/api/projects/${projectToken}/audio`,
          { method: "POST", body: formData },
        );
        if (!resp.ok) {
          throw new Error(`upload_failed: ${resp.status}`);
        }
        const body = (await resp.json()) as {
          projectToken: string;
          taskId?: string;
          chunkIndex?: number;
        };
        if (body.taskId) lastTaskId = body.taskId;
        setProgress((i + 1) / audioBlobs.length);
      }

      setTaskId(lastTaskId);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  return { phase, progress, error, projectToken, taskId, start };
}
