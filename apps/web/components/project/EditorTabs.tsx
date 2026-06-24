"use client";

import { useCallback, useState } from "react";
import type { ClipCandidate, SaveStatus } from "@clipwise/shared";
import { useAutosave } from "@/features/autosave/useAutosave";
import { patchCandidate } from "@/lib/candidate-api";
import { ExportPanel } from "./ExportPanel";
import styles from "./Editor.module.css";

type EditorTab = "copy" | "subtitle" | "export";

type EditorTabsProps = {
  candidate: ClipCandidate | null;
  candidates: ClipCandidate[];
  file: File | null;
  videoConnected: boolean;
  onCandidateChange: (candidate: ClipCandidate) => void;
  onRequestPreview: () => void;
  token: string;
};

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const labels: Record<SaveStatus, string> = {
    clean: "已保存",
    dirty: "等待保存",
    saving: "保存中",
    saved: "已保存",
    failed: "保存失败",
  };
  return <span className={styles.saveStatus}>{labels[status]}</span>;
}

export function EditorTabs({
  candidate,
  candidates,
  file,
  videoConnected,
  onCandidateChange,
  onRequestPreview,
  token,
}: EditorTabsProps) {
  const [tab, setTab] = useState<EditorTab>("copy");
  const save = useCallback(
    async (next: ClipCandidate) => {
      await patchCandidate(token, next);
    },
    [token],
  );
  const autosave = useAutosave<ClipCandidate>(save, 500);

  function change(next: ClipCandidate) {
    onCandidateChange(next);
    autosave.schedule(next);
  }

  return (
    <>
      <nav className={styles.tabs} aria-label="片段编辑">
        <button
          className={tab === "copy" ? styles.active : undefined}
          type="button"
          onClick={() => setTab("copy")}
        >
          文案
        </button>
        <button
          className={tab === "subtitle" ? styles.active : undefined}
          type="button"
          onClick={() => setTab("subtitle")}
        >
          字幕
        </button>
        <button
          className={tab === "export" ? styles.active : undefined}
          type="button"
          onClick={() => setTab("export")}
        >
          导出
        </button>
        {candidate && <SaveIndicator status={autosave.status} />}
      </nav>

      <div className={styles.content}>
        {!candidate && <p>选择一个候选片段后即可编辑文案。</p>}

        {candidate && tab === "copy" && (
          <div className={styles.form}>
            {candidate.titleOptions.map((title, index) => (
              <label key={`${candidate.id}-title-${index}`}>
                标题 {index + 1}
                <input
                  aria-label={`标题 ${index + 1}`}
                  value={title}
                  onChange={(event) => {
                    const titleOptions = [...candidate.titleOptions] as [
                      string,
                      string,
                      string,
                    ];
                    titleOptions[index] = event.target.value;
                    change({
                      ...candidate,
                      titleOptions,
                      selectedTitle:
                        index === 0 ? event.target.value : candidate.selectedTitle,
                    });
                  }}
                />
              </label>
            ))}
            <label>
              摘要
              <textarea
                value={candidate.summary}
                onChange={(event) =>
                  change({ ...candidate, summary: event.target.value })
                }
              />
            </label>
            <label>
              原文金句
              <textarea
                value={candidate.quote}
                onChange={(event) =>
                  change({ ...candidate, quote: event.target.value })
                }
              />
            </label>
            <section className={styles.readOnly}>
              <div className={styles.readOnlyHeader}>
                <h3>AI 分析与剪辑指导</h3>
                <span>辅助判断，不替代人工审片</span>
              </div>
              <dl className={styles.guidanceGrid}>
                <div>
                  <dt>推荐理由</dt>
                  <dd>{candidate.recommendationReason}</dd>
                </div>
                <div>
                  <dt>剪辑建议</dt>
                  <dd>{candidate.editingNote || "暂无额外剪辑建议。"}</dd>
                </div>
                <div>
                  <dt>边界说明</dt>
                  <dd>{candidate.boundaryReason || "已按转写片段边界生成。"}</dd>
                </div>
                <div>
                  <dt>风险提示</dt>
                  <dd>
                    {candidate.riskNotices.length
                      ? candidate.riskNotices.join("；")
                      : "无明显风险。"}
                  </dd>
                </div>
              </dl>
              {candidate.needsSetup && (
                <p className={styles.setupNotice}>
                  这段需要剪辑师补充开场或借用前文上下文。
                </p>
              )}
            </section>
          </div>
        )}

        {candidate && tab === "subtitle" && (
          <div className={styles.subtitleList}>
            {candidate.subtitles.map((subtitle, index) => (
              <div className={styles.subtitleLine} key={subtitle.id}>
                <time>
                  {formatTime(subtitle.startMs)} – {formatTime(subtitle.endMs)}
                </time>
                <textarea
                  aria-label={`字幕 ${index + 1}`}
                  value={subtitle.text}
                  onChange={(event) =>
                    change({
                      ...candidate,
                      subtitles: candidate.subtitles.map((item) =>
                        item.id === subtitle.id
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}

        {candidate && tab === "export" && (
          <ExportPanel
            candidate={candidate}
            candidates={candidates}
            file={file}
            videoConnected={videoConnected}
            onRequestPreview={onRequestPreview}
            projectToken={token}
          />
        )}
      </div>
    </>
  );
}
