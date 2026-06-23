"use client";

import { useState } from "react";
import type { ClipCandidate } from "@clipwise/shared";
import { useExportClip } from "@/features/project-state/use-export-clip";
import styles from "./Editor.module.css";

type ExportPanelProps = {
  candidate: ClipCandidate;
  candidates: ClipCandidate[];
  file: File | null;
  videoConnected: boolean;
  onRequestPreview: () => void;
};

export function ExportPanel({
  candidate,
  candidates,
  file,
  videoConnected,
  onRequestPreview,
}: ExportPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const { progress, exportSingle, exportBatch, reset } = useExportClip();

  const showConfirm =
    confirming &&
    !progress.status.match(/slicing|packaging|done/) &&
    candidate.previewStatus !== "previewed";
  const busy = progress.status === "slicing" || progress.status === "packaging";

  function runExport() {
    if (!file) return;
    void exportSingle(candidate, file);
  }

  function beginSingleExport() {
    if (candidate.previewStatus !== "previewed") {
      setConfirming(true);
      return;
    }
    runExport();
  }

  function beginBatchExport() {
    if (!file) return;
    void exportBatch(candidates.slice(0, 5), file);
  }

  return (
    <div className={styles.exportPanel}>
      {showConfirm && (
        <div className={styles.confirm}>
          <p>建议先预览片段，确认开头和结尾没有问题。</p>
          <div>
            <button type="button" onClick={onRequestPreview}>
              先预览
            </button>
            <button type="button" onClick={runExport}>
              继续导出
            </button>
          </div>
        </div>
      )}

      {busy && (
        <p className={styles.stageNotice}>
          {progress.status === "slicing" && progress.total > 1
            ? `正在切片 ${progress.current}/${progress.total}…`
            : progress.status === "packaging"
              ? "正在打包下载…"
              : "正在切片…"}
        </p>
      )}

      {progress.status === "done" && (
        <p className={styles.resultNotice}>导出完成，请检查浏览器下载。</p>
      )}

      {progress.status === "failed" && (
        <div className={styles.confirm}>
          <p>导出失败，可能是浏览器内存不足或视频格式问题。</p>
          <div>
            <button type="button" onClick={reset}>
              重试
            </button>
          </div>
        </div>
      )}

      <section>
        <h3>快速导出当前片段</h3>
        <p>MP4 + SRT + TXT 打包为 ZIP，在浏览器本地生成，原视频不上传。</p>
        <button
          type="button"
          disabled={!videoConnected || busy}
          onClick={beginSingleExport}
        >
          快速导出当前片段
        </button>
      </section>
      <section>
        <h3>批量快速导出 TOP 5</h3>
        <p>逐个处理后打包为 ZIP，避免浏览器内存压力。</p>
        <button
          type="button"
          disabled={!videoConnected || busy}
          onClick={beginBatchExport}
        >
          批量快速导出 TOP 5
        </button>
      </section>
    </div>
  );
}
