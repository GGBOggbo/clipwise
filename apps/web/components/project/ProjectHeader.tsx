import Link from "next/link";
import styles from "./ProjectWorkspace.module.css";

export function ProjectHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.logo}>
        Clip<span>wise</span>
      </div>
      <div className={styles.headerActions}>
        <span>演示项目</span>
        <Link href="/">新建项目</Link>
      </div>
    </header>
  );
}
