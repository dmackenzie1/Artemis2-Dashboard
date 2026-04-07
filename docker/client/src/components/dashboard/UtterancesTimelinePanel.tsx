import type { FC } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStatsHourlyByChannel, type MissionHourlyChannelEntry } from "../../api";
import styles from "./UtterancesTimelinePanel.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";
import { clientLogger } from "../../utils/logging/clientLogger";

const TIMELINE_POLL_INTERVAL_MS = 30 * 60 * 1000;

export const UtterancesTimelinePanel: FC<{ refreshToken?: number }> = ({ refreshToken = 0 }) => {
  const [histogram, setHistogram] = useState<MissionHourlyChannelEntry[]>([]);

  const loadTimeline = useCallback(async (): Promise<void> => {
    try {
      const hourlyPayload = await fetchStatsHourlyByChannel(30);
      setHistogram(hourlyPayload);
    } catch (error) {
      clientLogger.error("Unable to fetch timeline histogram", { error });
    }
  }, []);

  useEffect(() => {
    void loadTimeline();
    const pollHandle = window.setInterval(() => {
      void loadTimeline();
    }, TIMELINE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, [loadTimeline, refreshToken]);

  const hourlyTotals = useMemo(
    () =>
      Array.from(
        histogram.reduce((acc, entry) => {
          acc.set(entry.hour, (acc.get(entry.hour) ?? 0) + entry.utterances);
          return acc;
        }, new Map<string, number>())
      )
        .map(([hour, utterances]) => ({ hour, utterances }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
    [histogram]
  );

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
      title="Transcript Activity"
      headerAccessory={<StatusBadge label={hourlyTotals.length > 0 ? "ready" : "loading"} />}
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
