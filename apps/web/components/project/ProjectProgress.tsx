import styles from "./ProjectWorkspace.module.css";

const steps = ["选择回放", "分析内容", "生成候选", "预览确认", "导出素材"];

export function ProjectProgress() {
  return (
    <ol className={styles.progress} aria-label="项目处理进度">
      {steps.map((step, index) => (
        <li
          aria-current={index === 3 ? "step" : undefined}
          className={
            index < 3
              ? styles.progressDone
              : index === 3
                ? styles.progressActive
                : undefined
          }
          key={step}
        >
          <span aria-hidden="true" />
          {step}
        </li>
      ))}
    </ol>
  );
}
