import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStatsDailyVolume, fetchStatsHourlyByChannel, fetchStatsSummary, type MissionStatsSummaryData } from "../../api";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./StatsPanel.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";
import { clientLogger } from "../../utils/logging/clientLogger";

const DASHBOARD_POLL_INTERVAL_MS = 30 * 60 * 1000;

const formatMetricValue = (value: number): string => {
  return value.toLocaleString();
};

export const StatsPanel: FunctionComponent<{ refreshToken?: number }> = ({ refreshToken = 0 }) => {
  const [statsSummary, setStatsSummary] = useState<MissionStatsSummaryData | null>(null);
  const [dailyTranscriptVolume, setDailyTranscriptVolume] = useState<Array<{ day: string; utterances: number; words: number }>>([]);
  const [timelineHours, setTimelineHours] = useState(0);
  const [hasError, setHasError] = useState(false);

  const loadStats = useCallback(async (): Promise<void> => {
    const [statsSummaryResult, dailyVolumeResult, hourlyResult] = await Promise.allSettled([
      fetchStatsSummary(),
      fetchStatsDailyVolume(),
      fetchStatsHourlyByChannel(30)
    ]);

    let encounteredFailure = false;

    if (statsSummaryResult.status === "fulfilled") {
      setStatsSummary(statsSummaryResult.value);
    } else {
      encounteredFailure = true;
      clientLogger.error("Failed to fetch stats summary for stats panel", { error: statsSummaryResult.reason });
    }

    if (dailyVolumeResult.status === "fulfilled") {
      setDailyTranscriptVolume(
        (dailyVolumeResult.value?.days ?? []).map((day) => ({
          day: day.day,
          utterances: day.utterances,
          words: day.words
        }))
      );
    } else {
      encounteredFailure = true;
      clientLogger.error("Failed to fetch daily transcript volume for stats panel", { error: dailyVolumeResult.reason });
    }

    if (hourlyResult.status === "fulfilled") {
      setTimelineHours(new Set(hourlyResult.value.map((entry) => entry.hour)).size);
    } else {
      encounteredFailure = true;
      clientLogger.error("Failed to fetch hourly stats for stats panel", { error: hourlyResult.reason });
    }

    setHasError(encounteredFailure);
  }, []);

  useEffect(() => {
    void loadStats();
    const pollHandle = window.setInterval(() => {
      void loadStats();
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, [loadStats, refreshToken]);

  const stats = useMemo(() => {
    if (!statsSummary) {
      return [];
    }

    return [
      { label: "Min Day", value: statsSummary.days.minDay ?? "n/a" },
      { label: "Max Day", value: statsSummary.days.maxDay ?? "n/a" },
      { label: "Total Utterances", value: `${statsSummary.totals.utterances}` },
      { label: "Total Words", value: `${statsSummary.totals.words}` },
      { label: "Distinct Channels", value: `${statsSummary.totals.channels}` }
    ];
  }, [statsSummary]);

  const statusLabel = hasError ? "error" : stats.length > 0 ? "ready" : "loading";
  const coverageEntries = [...stats.filter((stat) => stat.label.includes("Day")), { label: "Hours", value: `${timelineHours}` }];
  const groupedStats = [
    {
      title: "Coverage",
      entries: coverageEntries
    },
    {
      title: "Volume",
      entries: stats.filter((stat) => stat.label.includes("Total"))
    },
    {
      title: "Full Scope",
      entries: stats.filter((stat) => stat.label.includes("Distinct"))
    }
  ].filter((group) => group.entries.length > 0);
  const dailyVolumeTotals = dailyTranscriptVolume.reduce(
    (acc, entry) => ({
      utterances: acc.utterances + entry.utterances,
      words: acc.words + entry.words
    }),
    { utterances: 0, words: 0 }
  );

  return (
    <DashboardPanel
      componentId="stats-panel"
      className={styles["stats-panel"]}
      kicker="Snapshot Review"
      title="Transcript Metrics"
      headerAccessory={<StatusBadge label={statusLabel} />}
    >
      {hasError && stats.length === 0 ? (
        <PaneStateMessage message="Unable to refresh transcript metrics right now. Retrying automatically." tone="error" />
      ) : null}
      {stats.length === 0 && !hasError ? <PaneStateMessage message="Waiting for mission metrics…" tone="loading" /> : null}
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
              <p className={styles["stats-group-label"]}>Daily Transcript Volume (All Days)</p>
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
                <tfoot>
                  <tr>
                    <th scope="row">Total ({dailyTranscriptVolume.length} days)</th>
                    <td>{formatMetricValue(dailyVolumeTotals.utterances)}</td>
                    <td>{formatMetricValue(dailyVolumeTotals.words)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          ) : null}
        </div>
      )}
    </DashboardPanel>
  );
};
