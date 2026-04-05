import type { FC } from "react";
import type { MissionHourlyChannelEntry } from "../../api";

type UtterancesTimelinePanelProps = {
  histogram: MissionHourlyChannelEntry[];
};

export const UtterancesTimelinePanel: FC<UtterancesTimelinePanelProps> = ({ histogram }) => {
  const maxUtterances = Math.max(...histogram.map((entry) => entry.utterances), 1);

  return (
    <section className="panel space-panel timeline-strip-panel">
      <div className="timeline-strip-header">
        <h2>Mission Activity Signature</h2>
        <small className="subtle">Utterances per hour across all channels</small>
      </div>
      {histogram.length === 0 ? <p className="subtle">No transcript data yet.</p> : null}
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
      <p className="subtle">Coverage: {histogram.length} hourly buckets.</p>
    </section>
  );
};
