import Link from "next/link";
import type { ProjectStatus } from "@clipwise/shared";
import styles from "./Editor.module.css";

const statusCopy: Record<
  Exclude<ProjectStatus, "ready" | "expired">,
  { title: string; description: string }
> = {
  waiting_for_video: {
    title: "等待选择视频",
    description: "选择本地 MP4 后即可开始。",
  },
  extracting_audio: {
    title: "正在读取视频",
    description: "请保持页面打开。",
  },
  uploading_audio: {
    title: "正在上传音频",
    description: "原始完整视频不会上传。",
  },
  transcribing: {
    title: "正在识别语音",
    description: "这一步可能需要几分钟。",
  },
  analyzing: {
    title: "正在分析内容",
    description: "正在寻找值得二次发布的片段。",
  },
  failed: {
    title: "处理失败",
    description: "你可以从失败阶段重新尝试。",
  },
};

export function ProjectStateView({ status }: { status: ProjectStatus }) {
  if (status === "ready") return null;

  if (status === "expired") {
    return (
      <div className={styles.stateView}>
        <h1>项目已过期</h1>
        <p>项目数据已按保存期限清理。</p>
        <Link href="/">新建项目</Link>
      </div>
    );
  }

  const copy = statusCopy[status];
  return (
    <div className={styles.stateView}>
      <h1>{copy.title}</h1>
      <p>{copy.description}</p>
      {status === "failed" && <button type="button">重试</button>}
    </div>
  );
}
