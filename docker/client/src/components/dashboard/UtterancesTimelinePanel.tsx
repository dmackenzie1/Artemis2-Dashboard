import type { FC } from "react";
import type { MissionHourlyChannelEntry } from "../../api";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type UtterancesTimelinePanelProps = {
  histogram: MissionHourlyChannelEntry[];
};

export const UtterancesTimelinePanel: FC<UtterancesTimelinePanelProps> = ({ histogram }) => {
  const maxUtterances = Math.max(...histogram.map((entry) => entry.utterances), 1);

  return (
    <DashboardPanel
      className="timeline-strip-panel"
      kicker="Communications Activity"
      title="Mission Activity Signature"
      headerAccessory={<StatusBadge label={histogram.length > 0 ? "ready" : "loading"} />}
      footer={<small className="subtle">Coverage: {histogram.length} hourly buckets.</small>}
    >
      <small className="subtle timeline-subtext">Utterances per hour across all channels</small>
      {histogram.length === 0 ? <PaneStateMessage message="Updating mission histogram…" tone="loading" /> : null}
      <div className="timeline-chart" role="img" aria-label="Utterances per hour for the mission timeline">
        {histogram.map((entry) => {
          const barHeight = Math.max((entry.utterances / maxUtterances) * 100, entry.utterances > 0 ? 4 : 0);

          return (
            <div
              key={entry.hour}
              className="timeline-bar"
              style={{ height: `${barHeight}%` }}
              title={`${entry.hour}: ${entry.utterances} utterances`}
            />
          );
        })}
      </div>
    </DashboardPanel>
  );
};
