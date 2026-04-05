import type { FunctionComponent } from "react";
import type { DashboardStat } from "../../pages/dashboard/types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";

type StatsPanelProps = {
  stats: DashboardStat[];
};

export const StatsPanel: FunctionComponent<StatsPanelProps> = ({ stats }) => {
  return (
    <DashboardPanel className="stats-panel" kicker="Snapshot" title="Stats">
      {stats.length === 0 ? (
        <PaneStateMessage message="No stats available yet." />
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
