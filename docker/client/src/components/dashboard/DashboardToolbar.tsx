import type { FC } from "react";
import type { HealthData } from "../../api";
import styles from "../../styles.module.css";
import { StatusBadge } from "./primitives/StatusBadge";
import { useComponentIdentity } from "./primitives/useComponentIdentity";

type DashboardToolbarProps = {
  health: HealthData | null;
};

export const DashboardToolbar: FC<DashboardToolbarProps> = ({ health }) => {
  const isConnected = !health || health.llm.connected;
  const { componentId, componentUid } = useComponentIdentity("dashboard-toolbar");

  return (
    <div className={styles["dashboard-toolbar"]} data-component-id={componentId} data-component-uid={componentUid}>
      <span className={styles["toolbar-label"]}>Pipeline</span>
      <StatusBadge label={isConnected ? "connected" : "disconnected"} />
    </div>
  );
};
