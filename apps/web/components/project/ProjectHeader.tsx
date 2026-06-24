import Link from "next/link";
import styles from "./ProjectWorkspace.module.css";

type ProjectHeaderProps = {
  sourceFileName: string;
  candidateCount: number;
};

export function ProjectHeader({
  sourceFileName,
  candidateCount,
}: ProjectHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        Clip<span>wise</span>
      </div>
      <div className={styles.headerActions}>
        <div className={styles.projectIdentity}>
          <span>{sourceFileName}</span>
          <small>{candidateCount} 个候选片段</small>
        </div>
        <Link href="/">新建项目</Link>
      </div>
    </header>
  );
}
