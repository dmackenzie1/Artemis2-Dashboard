import type { FC } from "react";
import type { HealthData } from "../../api";

type DashboardToolbarProps = {
  health: HealthData | null;
};

export const DashboardToolbar: FC<DashboardToolbarProps> = ({ health }) => {
  const isConnected = !health || health.llm.connected;

  return (
    <div className="dashboard-toolbar span2">
      <p className="subtle">Data refreshes automatically when backend starts.</p>
      <div className="llm-indicator-wrap" title={isConnected ? "LLM connected" : "LLM disconnected"}>
        <span className={`llm-indicator-dot ${isConnected ? "llm-indicator-ok" : "llm-indicator-bad"}`} />
      </div>
    </div>
  );
};
