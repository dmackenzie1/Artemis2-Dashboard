import type { FC } from "react";
import type { MissionHourlyChannelEntry } from "../../api";
import styles from "../../styles.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type UtterancesTimelinePanelProps = {
  histogram: MissionHourlyChannelEntry[];
};

export const UtterancesTimelinePanel: FC<UtterancesTimelinePanelProps> = ({ histogram }) => {
  const maxUtterances = Math.max(...histogram.map((entry) => entry.utterances), 1);
  const labelIndexes = histogram.length > 0 ? new Set([0, Math.floor(histogram.length / 3), Math.floor((histogram.length * 2) / 3), histogram.length - 1]) : new Set<number>();

  return (
    <DashboardPanel
      componentId="utterances-timeline-panel"
      className={styles["timeline-strip-panel"]}
      kicker="Communications Activity"
      title="Mission Activity Signature"
      headerAccessory={<StatusBadge label={histogram.length > 0 ? "ready" : "loading"} />}
      footer={<small className={styles.subtle}>Coverage: {histogram.length} hourly buckets.</small>}
    >
      <small className={`${styles.subtle} ${styles["timeline-subtext"]}`}>Utterances per hour across all channels</small>
      {histogram.length === 0 ? <PaneStateMessage message="Updating mission histogram…" tone="loading" /> : null}
      <div className={styles["timeline-chart"]} role="img" aria-label="Utterances per hour for the mission timeline">
        {histogram.map((entry) => {
          const barHeight = Math.max((entry.utterances / maxUtterances) * 100, entry.utterances > 0 ? 4 : 0);

          return (
            <div
              key={entry.hour}
              className={styles["timeline-bar"]}
              style={{ height: `${barHeight}%` }}
              title={`${entry.hour}: ${entry.utterances} utterances`}
            />
          );
        })}
      </div>
      {histogram.length > 0 ? (
        <div className={styles["timeline-axis"]} aria-hidden="true">
          {histogram.map((entry, index) => {
            const hourSegment = entry.hour.includes("T") ? entry.hour.split("T")[1] : entry.hour.split(" ")[1];
            const hourLabel = hourSegment?.slice(0, 2) ?? entry.hour.slice(-2);
            const label = `${hourLabel}:00`;
            const shouldShow = labelIndexes.has(index);

            return (
              <span key={`${entry.hour}-axis`} className={styles["timeline-axis-label"]}>
                {shouldShow ? label : ""}
              </span>
            );
          })}
        </div>
      ) : null}
    </DashboardPanel>
  );
};
