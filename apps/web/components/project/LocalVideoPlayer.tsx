"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ClipCandidate, PreviewStatus } from "@clipwise/shared";
import { getPreviewStatus } from "@/features/local-video/preview-progress";
import styles from "./LocalVideoPlayer.module.css";

type LocalVideoPlayerProps = {
  candidate: ClipCandidate | null;
  file: File | null;
  onFileChange: (file: File) => void;
  onPreviewStatusChange: (status: PreviewStatus) => void;
};

function formatClock(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

export function LocalVideoPlayer({
  candidate,
  file,
  onFileChange,
  onPreviewStatusChange,
}: LocalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTimeRef = useRef<number | null>(null);
  const playedMsRef = useRef(0);
  const objectUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );

  useEffect(() => {
    playedMsRef.current = 0;
    lastTimeRef.current = null;
    videoRef.current?.pause();
  }, [candidate?.id]);

  function startPreview() {
    if (!candidate || !videoRef.current) return;
    videoRef.current.currentTime = candidate.startMs / 1000;
    void videoRef.current.play();
  }

  function handleTimeUpdate() {
    if (!candidate || !videoRef.current) return;
    const currentMs = videoRef.current.currentTime * 1000;

    if (currentMs >= candidate.endMs) {
      videoRef.current.pause();
      onPreviewStatusChange(
        getPreviewStatus(playedMsRef.current, candidate.durationMs),
      );
      return;
    }

    if (currentMs < candidate.startMs) return;

    if (lastTimeRef.current !== null) {
      const delta = Math.max(0, currentMs - lastTimeRef.current);
      if (delta < 2_000) playedMsRef.current += delta;
    }
    lastTimeRef.current = currentMs;
    onPreviewStatusChange(
      getPreviewStatus(playedMsRef.current, candidate.durationMs),
    );
  }

  return (
    <div className={styles.player}>
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="file"
        accept="video/mp4,.mp4"
        aria-label="重新选择本地原视频"
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          if (nextFile) onFileChange(nextFile);
        }}
      />

      {objectUrl ? (
        <>
          <video
            ref={videoRef}
            className={styles.video}
            src={objectUrl}
            controls
            data-testid="local-video"
            onTimeUpdate={handleTimeUpdate}
          />
          {candidate && (
            <div className={styles.overlay}>
              <span>
                {formatClock(candidate.startMs)} – {formatClock(candidate.endMs)}
              </span>
              <strong>{candidate.selectedTitle}</strong>
              <button type="button" onClick={startPreview}>
                播放该片段
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.reconnect}>
          <span aria-hidden="true">▶</span>
          <strong>
            {candidate ? "需要重新关联原视频" : "尚未关联本地视频"}
          </strong>
          <p>原视频不会上传，只用于本地预览和导出。</p>
          <button type="button" onClick={() => inputRef.current?.click()}>
            重新选择原视频
          </button>
        </div>
      )}
    </div>
  );
}
