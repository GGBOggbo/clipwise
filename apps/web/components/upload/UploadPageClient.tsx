"use client";

import type { DragEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateVideoFile } from "@/lib/file-validation";
import styles from "./UploadPage.module.css";

type UploadState = "empty" | "selected" | "creating" | "error";

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPageClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("empty");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    const result = validateVideoFile(nextFile);

    if (!result.ok) {
      setFile(null);
      setState("error");
      setError(result.message);
      return;
    }

    setFile(nextFile);
    setState("selected");
    setError("");
  }

  function startAnalysis() {
    if (!file) return;
    sessionStorage.setItem("clipwise-demo-file-name", file.name);
    setState("creating");
    router.push("/project/demo-project");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  function handleDropZoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    inputRef.current?.click();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.logo}>
          Clip<span>wise</span>
        </div>
        <p>桌面端推荐 · 原始视频不上传</p>
      </header>

      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.intro}>
            <h1>不用看完整场直播，也能找到高价值片段</h1>
            <p>把 1–2 小时的知识直播回放，变成几段可发布的视频素材。</p>
          </div>

          <input
            ref={inputRef}
            className={styles.hiddenInput}
            type="file"
            accept="video/mp4,.mp4"
            aria-label="选择本地 MP4 回放"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          <div className={styles.actions}>
            <div
              aria-label="上传 MP4 回放"
              className={`${styles.dropZone} ${
                isDragging ? styles.dropZoneActive : ""
              }`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setIsDragging(true);
              }}
              onDrop={handleDrop}
              onKeyDown={handleDropZoneKeyDown}
            >
              <span className={styles.dropIcon} aria-hidden="true">
                {file && !isDragging ? "✓" : "↑"}
              </span>
              {isDragging ? (
                <>
                  <strong>松开即可选择</strong>
                  <span>将替换当前选择的文件</span>
                </>
              ) : file ? (
                <>
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                  <span>点击或拖入新文件替换</span>
                </>
              ) : (
                <>
                  <strong>拖拽 MP4 到这里</strong>
                  <span>或点击选择本地文件</span>
                </>
              )}
            </div>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            {file && (
              <button
                className={styles.startButton}
                type="button"
                disabled={state === "creating"}
                onClick={startAnalysis}
              >
                {state === "creating" ? "正在创建项目…" : "开始分析"}
              </button>
            )}
          </div>

          <p className={styles.privacy}>
            <strong>原视频不上传</strong>，只上传压缩音频用于 AI 分析。
            <br />
            推荐使用电脑端 <strong>Chrome / Edge</strong>。
          </p>

          <div className={styles.results}>
            <p className={styles.sectionLabel}>你会得到</p>
            <div className={styles.resultGrid}>
              <article>
                <span
                  className={styles.resultIcon}
                  data-testid="result-icon"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v8" />
                    <path d="M8 12h8" />
                  </svg>
                </span>
                <h2>AI 推荐切片</h2>
                <p>TOP 5 片段，按推荐度排序，快速定位高价值内容。</p>
              </article>
              <article>
                <span
                  className={styles.resultIcon}
                  data-testid="result-icon"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                  </svg>
                </span>
                <h2>标题 / 摘要 / 金句</h2>
                <p>可复制可编辑，直接用于发布文案。</p>
              </article>
              <article>
                <span
                  className={styles.resultIcon}
                  data-testid="result-icon"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                </span>
                <h2>MP4 / SRT / 文案</h2>
                <p>快速导出，原始视频不上传服务器。</p>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        支持 MP4 · 最长 2 小时 · 最大 2GB · 推荐 Chrome / Edge
      </footer>
    </div>
  );
}
