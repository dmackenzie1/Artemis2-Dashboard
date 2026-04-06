import type { FunctionComponent } from "react";
import styles from "../../../styles.module.css";
import { useComponentIdentity } from "./useComponentIdentity";

type LoadingVariant = "pane" | "inline" | "console" | "pipeline" | "refreshing";

type LoadingIndicatorProps = {
  message: string;
  variant?: LoadingVariant;
};

export const LoadingIndicator: FunctionComponent<LoadingIndicatorProps> = ({ message, variant = "pane" }) => {
  const { componentId, componentUid } = useComponentIdentity("loading-indicator");

  return (
    <div
      className={`${styles["loading-indicator"]} ${styles[`loading-${variant}`]}`}
      role="status"
      aria-live="polite"
      data-component-id={componentId}
      data-component-uid={componentUid}
    >
      <svg className={styles["loading-orbit"]} viewBox="0 0 120 120" aria-hidden="true">
        <circle className={`${styles["loading-ring"]} ${styles["loading-ring-outer"]}`} cx="60" cy="60" r="42" />
        <circle className={`${styles["loading-ring"]} ${styles["loading-ring-inner"]}`} cx="60" cy="60" r="26" />
        <circle className={styles["loading-beacon"]} cx="102" cy="60" r="4" />
      </svg>
      <p className={styles["loading-label"]}>{message}</p>
    </div>
  );
};
