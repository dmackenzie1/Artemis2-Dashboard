import type { FunctionComponent } from "react";
import type { DashboardStat } from "../../pages/dashboard/types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type StatsPanelProps = {
  stats: DashboardStat[];
};

export const StatsPanel: FunctionComponent<StatsPanelProps> = ({ stats }) => {
  const statusLabel = stats.length > 0 ? "ready" : "loading";

  return (
    <DashboardPanel className="stats-panel" kicker="Snapshot" title="Stats" headerAccessory={<StatusBadge label={statusLabel} />}>
      {stats.length === 0 ? (
        <PaneStateMessage message="Waiting for mission metrics…" tone="loading" />
      ) : (
        <table className="stats-table">
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.label}>
                <th scope="row">{stat.label}</th>
                <td>{stat.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardPanel>
  );
};
