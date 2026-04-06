import type { FunctionComponent } from "react";
import styles from "./StatusBadge.module.css";
import { useComponentIdentity } from "./useComponentIdentity";

type StatusTone =
  | "ready"
  | "loading"
  | "partial"
  | "building"
  | "degraded"
  | "error"
  | "connected"
  | "disconnected";

type StatusBadgeProps = {
  label: string;
};

const normalizeTone = (label: string): StatusTone => {
  const normalized = label.trim().toLowerCase();

  if (normalized.includes("connected")) {
    return "connected";
  }

  if (normalized.includes("offline") || normalized.includes("disconnected")) {
    return "disconnected";
  }

  if (normalized.includes("error") || normalized.includes("failed")) {
    return "error";
  }

  if (normalized.includes("degraded")) {
    return "degraded";
  }

  if (normalized.includes("partial")) {
    return "partial";
  }

  if (normalized.includes("building")) {
    return "building";
  }

  if (normalized.includes("loading") || normalized.includes("querying") || normalized.includes("running")) {
    return "loading";
  }

  return "ready";
};

export const StatusBadge: FunctionComponent<StatusBadgeProps> = ({ label }) => {
  const tone = normalizeTone(label);
  const { componentId, componentUid } = useComponentIdentity("status-badge");

  return (
    <span className={`${styles["status-badge"]} ${styles[`status-${tone}`]}`} data-component-id={componentId} data-component-uid={componentUid}>
      <span className={styles["status-dot"]} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
