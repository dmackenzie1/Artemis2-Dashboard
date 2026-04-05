import type { FC } from "react";
import type { HealthData } from "../../api";

type DashboardToolbarProps = {
  health: HealthData | null;
};

export const DashboardToolbar: FC<DashboardToolbarProps> = ({ health }) => {
  return (
    <div className="dashboard-toolbar span2">
      {health && !health.llm.connected ? (
        <p className="health-bad">
          LLM Disconnected{health.llm.error ? ` - ${health.llm.error}` : ""}
        </p>
      ) : (
        <p className="health-ok">LLM Connected</p>
      )}
      <p>Data refreshes automatically when backend starts.</p>
    </div>
  );
};
