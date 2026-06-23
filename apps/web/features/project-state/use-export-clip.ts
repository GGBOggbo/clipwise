"use client";

import { useCallback, useRef, useState } from "react";
import { zip } from "fflate";
import type { ClipCandidate } from "@clipwise/shared";
import { sliceVideoClip } from "@/lib/ffmpeg";
import {
  buildClipFileName,
  buildSrtContent,
  buildTxtContent,
} from "@/lib/export-clip";

export type ExportState =
  | "idle"
  | "slicing"
  | "packaging"
  | "done"
  | "failed";

export type ExportProgress = {
  status: ExportState;
  /** 当前正在处理第几个（1-based），批量导出用 */
  current: number;
  /** 总数 */
  total: number;
};

/**
 * 触发浏览器下载一个 Blob。
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延迟释放，避免下载还没开始就被回收
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 把 Blob/字符串转成 Uint8Array（fflate zip 需要）。
 */
async function toBytes(data: Blob | string): Promise<Uint8Array> {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * 管理本地快速导出的状态机 hook。
 *
 * - exportSingle：切当前片段 MP4 + 生成 SRT/TXT，3 个文件分别下载。
 * - exportBatch：串行切 TOP N，打包成单个 ZIP 下载（避免内存爆）。
 * 原视频全程在浏览器本地，不上传服务器。
 */
export function useExportClip() {
  const [progress, setProgress] = useState<ExportProgress>({
    status: "idle",
    current: 0,
    total: 0,
  });
  // 防止并发导出
  const busyRef = useRef(false);

  const exportSingle = useCallback(
    async (candidate: ClipCandidate, file: File): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      setProgress({ status: "slicing", current: 1, total: 1 });
      try {
        const mp4 = await sliceVideoClip(file, candidate.startMs, candidate.endMs);
        const srt = buildSrtContent(candidate.subtitles, candidate.startMs);
        const txt = buildTxtContent(candidate);
        const base = buildClipFileName(candidate.rank, candidate.selectedTitle, "");
        const stem = base.slice(0, -1); // 去掉末尾的点

        setProgress({ status: "packaging", current: 1, total: 1 });
        downloadBlob(mp4, `${stem}mp4`);
        if (srt) downloadBlob(new Blob([srt], { type: "text/plain" }), `${stem}srt`);
        downloadBlob(new Blob([txt], { type: "text/plain" }), `${stem}txt`);
        setProgress({ status: "done", current: 1, total: 1 });
      } catch (err) {
        console.error("导出失败", err);
        setProgress({ status: "failed", current: 0, total: 0 });
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  const exportBatch = useCallback(
    async (candidates: ClipCandidate[], file: File): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      const total = candidates.length;
      setProgress({ status: "slicing", current: 0, total });
      try {
        const entries: Record<string, Uint8Array> = {};
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          const mp4 = await sliceVideoClip(file, candidate.startMs, candidate.endMs);
          const srt = buildSrtContent(candidate.subtitles, candidate.startMs);
          const txt = buildTxtContent(candidate);
          const stem = buildClipFileName(
            candidate.rank,
            candidate.selectedTitle,
            "",
          ).slice(0, -1); // 去末尾点
          entries[`${stem}mp4`] = await toBytes(mp4);
          if (srt) entries[`${stem}srt`] = await toBytes(srt);
          entries[`${stem}txt`] = await toBytes(txt);
          setProgress({ status: "slicing", current: i + 1, total });
        }

        setProgress({ status: "packaging", current: total, total });
        const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
          zip(entries, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
        downloadBlob(
          new Blob([zipBytes.buffer as ArrayBuffer], { type: "application/zip" }),
          "clipwise-export.zip",
        );
        setProgress({ status: "done", current: total, total });
      } catch (err) {
        console.error("批量导出失败", err);
        setProgress({ status: "failed", current: 0, total: 0 });
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setProgress({ status: "idle", current: 0, total: 0 });
  }, []);

  return { progress, exportSingle, exportBatch, reset };
}
