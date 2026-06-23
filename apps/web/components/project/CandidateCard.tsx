import {
  getRecommendationLevel,
  type ClipCandidate,
} from "@clipwise/shared";
import styles from "./CandidateCard.module.css";

function formatClock(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${seconds > 0 ? `${seconds}秒` : ""}`;
}

type CandidateCardProps = {
  candidate: ClipCandidate;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onToggleDetails: () => void;
};

export function CandidateCard({
  candidate,
  selected,
  expanded,
  onSelect,
  onPreview,
  onToggleDetails,
}: CandidateCardProps) {
  return (
    <article
      className={`${styles.card} ${selected ? styles.selected : ""}`}
      data-testid="candidate-card"
    >
      <div className={styles.meta}>
        <div>
          <span>{candidate.type}</span>
          <strong>{getRecommendationLevel(candidate.recommendation)}</strong>
        </div>
        <time data-testid="candidate-time">
          {formatClock(candidate.startMs)} – {formatClock(candidate.endMs)} ·{" "}
          {formatDuration(candidate.durationMs)}
        </time>
      </div>

      <button
        className={styles.selectArea}
        type="button"
        aria-label={`选择片段：${candidate.selectedTitle}`}
        onClick={onSelect}
      >
        <strong>{candidate.selectedTitle}</strong>
        <span>{candidate.summary}</span>
        <q>{candidate.quote}</q>
      </button>

      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={onPreview}>
          预览片段
        </button>
        <button type="button" onClick={onToggleDetails}>
          {expanded ? "收起详情" : "查看详情"}
        </button>
      </div>

      {expanded && (
        <div className={styles.details}>
          <section>
            <h3>标题候选</h3>
            <ol>
              {candidate.titleOptions.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3>推荐理由</h3>
            <p>{candidate.recommendationReason}</p>
          </section>
          <section>
            <h3>风险提示</h3>
            <p>
              {candidate.riskNotices.length > 0
                ? candidate.riskNotices.join("；")
                : "无明显风险。"}
            </p>
          </section>
        </div>
      )}
    </article>
  );
}
