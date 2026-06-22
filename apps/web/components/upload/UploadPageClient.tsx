"use client";

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
            <button
              className={styles.selectButton}
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <span aria-hidden="true">＋</span>
              选择回放
            </button>

            {file && (
              <div className={styles.fileInfo}>
                <div>
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                >
                  重新选择
                </button>
              </div>
            )}

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
                <span aria-hidden="true">01</span>
                <h2>AI 推荐切片</h2>
                <p>TOP 5 片段，按推荐度排序，快速定位高价值内容。</p>
              </article>
              <article>
                <span aria-hidden="true">02</span>
                <h2>标题 / 摘要 / 金句</h2>
                <p>可复制可编辑，直接用于发布文案。</p>
              </article>
              <article>
                <span aria-hidden="true">03</span>
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
