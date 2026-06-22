"use client";

import { useState } from "react";
import type { ClipCandidate, ExportStatus } from "@clipwise/shared";
import { requestExport } from "@/features/project-state/export-machine";
import styles from "./Editor.module.css";

type ExportPanelProps = {
  candidate: ClipCandidate;
  videoConnected: boolean;
  onRequestPreview: () => void;
};

export function ExportPanel({
  candidate,
  videoConnected,
  onRequestPreview,
}: ExportPanelProps) {
  const [status, setStatus] = useState<ExportStatus>("idle");

  function beginExport() {
    setStatus(requestExport(candidate.previewStatus));
  }

  return (
    <div className={styles.exportPanel}>
      {status === "confirming" && (
        <div className={styles.confirm}>
          <p>建议先预览片段，确认开头和结尾没有问题。</p>
          <div>
            <button type="button" onClick={onRequestPreview}>
              先预览
            </button>
            <button type="button" onClick={() => setStatus("preparing")}>
              继续导出
            </button>
          </div>
        </div>
      )}

      {status === "preparing" && (
        <p className={styles.stageNotice}>真实文件导出将在第三阶段接通。</p>
      )}

      <section>
        <h3>快速导出当前片段</h3>
        <p>MP4 + SRT + TXT，在浏览器本地生成，原视频不上传。</p>
        <button type="button" disabled={!videoConnected} onClick={beginExport}>
          快速导出当前片段
        </button>
      </section>
      <section>
        <h3>批量快速导出 TOP 5</h3>
        <p>逐个处理后打包为 ZIP，避免浏览器内存压力。</p>
        <button type="button" disabled={!videoConnected}>
          批量快速导出 TOP 5
        </button>
      </section>
      <section>
        <h3>生成带字幕视频</h3>
        <p>只上传当前短片，不上传完整直播回放。</p>
        <button type="button" disabled={!videoConnected}>
          生成带字幕视频
        </button>
      </section>
    </div>
  );
}
