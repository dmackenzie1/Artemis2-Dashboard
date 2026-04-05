import type { FC } from "react";
import type { HealthData } from "../../api";
import { StatusBadge } from "./primitives/StatusBadge";

type DashboardToolbarProps = {
  health: HealthData | null;
};

export const DashboardToolbar: FC<DashboardToolbarProps> = ({ health }) => {
  const isConnected = !health || health.llm.connected;

  return (
    <div className="dashboard-toolbar">
      <span className="toolbar-label">Pipeline</span>
      <StatusBadge label={isConnected ? "connected" : "disconnected"} />
    </div>
  );
};
