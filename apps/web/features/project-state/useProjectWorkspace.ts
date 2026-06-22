"use client";

import { useMemo, useState } from "react";
import type { ClipwiseProject } from "@clipwise/shared";

export type CandidateSort = "rank" | "time";

export function useProjectWorkspace(initialProject: ClipwiseProject) {
  const [project, setProject] = useState(initialProject);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(
    null,
  );
  const [sort, setSort] = useState<CandidateSort>("rank");
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => {
    const source = showAll
      ? [...project.candidates]
      : project.candidates.slice(0, 5);

    return source.sort((a, b) =>
      sort === "rank" ? a.rank - b.rank : a.startMs - b.startMs,
    );
  }, [project.candidates, showAll, sort]);

  const selectedCandidate =
    project.candidates.find(({ id }) => id === selectedCandidateId) ?? null;

  return {
    project,
    setProject,
    candidates,
    selectedCandidate,
    selectedCandidateId,
    setSelectedCandidateId,
    expandedCandidateId,
    setExpandedCandidateId,
    sort,
    setSort,
    showAll,
    setShowAll,
  };
}
