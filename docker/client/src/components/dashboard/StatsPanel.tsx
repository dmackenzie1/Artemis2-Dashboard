import type { FunctionComponent } from "react";
import type { DashboardStat } from "../../pages/dashboard/types";
import styles from "../../styles.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type StatsPanelProps = {
  stats: DashboardStat[];
};

export const StatsPanel: FunctionComponent<StatsPanelProps> = ({ stats }) => {
  const statusLabel = stats.length > 0 ? "ready" : "loading";
  const groupedStats = [
    {
      title: "Coverage",
      entries: stats.filter((stat) => stat.label.includes("Day"))
    },
    {
      title: "Volume",
      entries: stats.filter((stat) => stat.label.includes("Total"))
    },
    {
      title: "Scope",
      entries: stats.filter((stat) => stat.label.includes("Distinct"))
    }
  ].filter((group) => group.entries.length > 0);

  return (
    <DashboardPanel
      componentId="stats-panel"
      className={styles["stats-panel"]}
      kicker="Snapshot"
      title="Stats"
      headerAccessory={<StatusBadge label={statusLabel} />}
    >
      {stats.length === 0 ? <PaneStateMessage message="Waiting for mission metrics…" tone="loading" /> : null}
      {stats.length === 0 ? (
        <div className={styles["stats-skeleton-grid"]} aria-hidden="true">
          <div className={styles["skeleton-row"]} />
          <div className={styles["skeleton-row"]} />
          <div className={styles["skeleton-row"]} />
        </div>
      ) : (
        <div className={styles["stats-groups"]}>
          {groupedStats.map((group) => (
            <section key={group.title} className={styles["stats-group"]}>
              <p className={styles["stats-group-label"]}>{group.title}</p>
              <table className={styles["stats-table"]}>
                <tbody>
                  {group.entries.map((stat) => (
                    <tr key={stat.label}>
                      <th scope="row">{stat.label}</th>
                      <td>{stat.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
};
