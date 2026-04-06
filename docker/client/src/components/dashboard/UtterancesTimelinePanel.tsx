import type { FC } from "react";
import type { MissionHourlyChannelEntry } from "../../api";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./UtterancesTimelinePanel.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type UtterancesTimelinePanelProps = {
  histogram: MissionHourlyChannelEntry[];
};

export const UtterancesTimelinePanel: FC<UtterancesTimelinePanelProps> = ({ histogram }) => {
  const hourlyTotals = Array.from(
    histogram.reduce((acc, entry) => {
      acc.set(entry.hour, (acc.get(entry.hour) ?? 0) + entry.utterances);
      return acc;
    }, new Map<string, number>())
  )
    .map(([hour, utterances]) => ({ hour, utterances }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const maxUtterances = Math.max(...hourlyTotals.map((entry) => entry.utterances), 0);
  const yAxisTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio, index) => ({
    id: `tick-${index}`,
    value: Math.round(maxUtterances * ratio)
  }));
  const xTickInterval = hourlyTotals.length > 96 ? 12 : 6;
  const xAxisTicks = hourlyTotals
    .map((entry, index) => ({ ...entry, index }))
    .filter(({ index }) => index === 0 || index === hourlyTotals.length - 1 || index % xTickInterval === 0);

  return (
    <DashboardPanel
      componentId="utterances-timeline-panel"
      className={styles["timeline-strip-panel"]}
      kicker="Transcript Timeline"
      title="Hourly Transcript Activity"
      headerAccessory={<StatusBadge label={hourlyTotals.length > 0 ? "ready" : "loading"} />}
      footer={<small className={sharedStyles.subtle}>Coverage: {hourlyTotals.length} hourly buckets.</small>}
    >
      {hourlyTotals.length === 0 ? <PaneStateMessage message="Updating mission histogram…" tone="loading" /> : null}
      <div className={styles["timeline-chart-shell"]}>
        <div className={styles["timeline-y-axis"]} aria-hidden>
          {yAxisTicks.map((tick) => (
            <span key={tick.id} className={styles["timeline-y-tick-label"]}>
              {tick.value.toLocaleString()}
            </span>
          ))}
        </div>
        <div className={styles["timeline-plot-area"]}>
          <div className={styles["timeline-chart"]} role="img" aria-label="Utterances per hour for the mission timeline">
            {hourlyTotals.map((entry, index) => {
              const normalizedHeight = maxUtterances > 0 ? (entry.utterances / maxUtterances) * 100 : 0;
              const barHeight = Math.max(normalizedHeight, entry.utterances > 0 ? 4 : 0);
              const highlightBar = index >= hourlyTotals.length - Math.min(12, hourlyTotals.length);

              return (
                <div
                  key={entry.hour}
                  className={`${styles["timeline-bar"]} ${highlightBar ? styles["timeline-bar-highlight"] : ""}`}
                  style={{ height: `${barHeight}%` }}
                  title={`${entry.hour}: ${entry.utterances} utterances`}
                />
              );
            })}
          </div>
          <div className={styles["timeline-x-axis"]} aria-hidden>
            {xAxisTicks.map((tick) => (
              <span
                key={tick.hour}
                className={styles["timeline-x-tick-label"]}
                style={{ left: `${(tick.index / Math.max(hourlyTotals.length - 1, 1)) * 100}%` }}
              >
                {new Date(tick.hour).toLocaleDateString([], {
                  month: "2-digit",
                  day: "2-digit",
                  timeZone: "UTC"
                })}
              </span>
            ))}
          </div>
          <div className={styles["timeline-x-axis-title"]}>mm/dd (UTC)</div>
        </div>
      </div>
    </DashboardPanel>
  );
};
