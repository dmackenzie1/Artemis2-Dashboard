import type { FunctionComponent } from "react";
import type { DashboardStat } from "../../pages/dashboard/types";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./StatsPanel.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type StatsPanelProps = {
  stats: DashboardStat[];
  dailyTranscriptVolume: Array<{
    day: string;
    utterances: number;
    words: number;
  }>;
};

const formatMetricValue = (value: number): string => {
  return value.toLocaleString();
};

export const StatsPanel: FunctionComponent<StatsPanelProps> = ({ stats, dailyTranscriptVolume }) => {
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
      kicker="Snapshot Review"
      title="Transcript Metrics"
      headerAccessory={<StatusBadge label={statusLabel} />}
    >
      {stats.length === 0 ? <PaneStateMessage message="Waiting for mission metrics…" tone="loading" /> : null}
      {stats.length === 0 ? (
        <div className={styles["stats-skeleton-grid"]} aria-hidden="true">
          <div className={sharedStyles["skeleton-row"]} />
          <div className={sharedStyles["skeleton-row"]} />
          <div className={sharedStyles["skeleton-row"]} />
        </div>
      ) : (
        <div className={styles["stats-groups"]}>
          {groupedStats.map((group) => (
            <section key={group.title} className={styles["stats-group"]}>
              <p className={styles["stats-group-label"]}>{group.title}</p>
              <table className={styles["stats-table"]}>
                <colgroup>
                  <col className={styles["stats-label-col"]} />
                  <col className={styles["stats-value-col"]} />
                </colgroup>
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
          {dailyTranscriptVolume.length > 0 ? (
            <section className={styles["stats-group"]}>
              <p className={styles["stats-group-label"]}>Daily Transcript Volume</p>
              <table className={styles["daily-volume-table"]}>
                <colgroup>
                  <col className={styles["snapshot-day-col"]} />
                  <col className={styles["snapshot-value-col"]} />
                  <col className={styles["snapshot-value-col"]} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Utterances</th>
                    <th scope="col">Words</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyTranscriptVolume.map((entry) => (
                    <tr key={entry.day}>
                      <th scope="row">{entry.day}</th>
                      <td>{formatMetricValue(entry.utterances)}</td>
                      <td>{formatMetricValue(entry.words)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </div>
      )}
    </DashboardPanel>
  );
};
