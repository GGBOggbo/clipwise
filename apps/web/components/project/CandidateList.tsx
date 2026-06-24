import type { ClipCandidate } from "@clipwise/shared";
import type { CandidateSort } from "@/features/project-state/useProjectWorkspace";
import { CandidateCard } from "./CandidateCard";
import styles from "./ProjectWorkspace.module.css";

type CandidateListProps = {
  candidates: ClipCandidate[];
  total: number;
  selectedId: string | null;
  expandedId: string | null;
  sort: CandidateSort;
  showAll: boolean;
  onSortChange: (sort: CandidateSort) => void;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onToggleDetails: (id: string) => void;
  onToggleShowAll: () => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
};

export function CandidateList({
  candidates,
  total,
  selectedId,
  expandedId,
  sort,
  showAll,
  onSortChange,
  onSelect,
  onPreview,
  onToggleDetails,
  onToggleShowAll,
  onRegenerate,
  canRegenerate,
}: CandidateListProps) {
  return (
    <aside className={styles.rightPanel}>
      <div className={styles.candidateHeader}>
        <h2>候选片段</h2>
        <span>
          {candidates.length} / {total} 个候选
        </span>
      </div>

      <div className={styles.sortBar}>
        <button
          aria-pressed={sort === "rank"}
          className={sort === "rank" ? styles.sortActive : undefined}
          type="button"
          onClick={() => onSortChange("rank")}
        >
          推荐优先
        </button>
        <button
          aria-pressed={sort === "time"}
          className={sort === "time" ? styles.sortActive : undefined}
          type="button"
          onClick={() => onSortChange("time")}
        >
          按时间顺序
        </button>
      </div>

      <div className={styles.candidateScroll}>
        {candidates.map((candidate) => (
          <CandidateCard
            candidate={candidate}
            expanded={candidate.id === expandedId}
            key={candidate.id}
            selected={candidate.id === selectedId}
            onPreview={() => onPreview(candidate.id)}
            onSelect={() => onSelect(candidate.id)}
            onToggleDetails={() => onToggleDetails(candidate.id)}
          />
        ))}
      </div>

      <div className={styles.candidateFooter}>
        <button type="button" onClick={onToggleShowAll}>
          {showAll ? "收起多余候选" : "查看更多候选"}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!canRegenerate}
          title={
            canRegenerate
              ? "重新调用 AI 生成候选（仅可使用一次）"
              : "已使用过重新生成，无法再次操作"
          }
        >
          {canRegenerate ? "重新生成候选（仅一次）" : "已重新生成过"}
        </button>
      </div>
    </aside>
  );
}
