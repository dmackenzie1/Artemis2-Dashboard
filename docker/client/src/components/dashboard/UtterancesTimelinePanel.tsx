import type { FC } from "react";
import type { MissionHourlyChannelEntry } from "../../api";

type UtterancesTimelinePanelProps = {
  histogram: MissionHourlyChannelEntry[];
};

export const UtterancesTimelinePanel: FC<UtterancesTimelinePanelProps> = ({ histogram }) => {
  const maxUtterances = Math.max(...histogram.map((entry) => entry.utterances), 1);

  return (
    <section className="panel space-panel span2">
      <h2>Utterances Over Time</h2>
      {histogram.length === 0 ? <p className="subtle">No transcript data yet.</p> : null}
      <div className="timeline-chart" role="img" aria-label="Utterances over time chart">
        {histogram.map((entry) => {
          const barHeight = Math.max((entry.utterances / maxUtterances) * 100, entry.utterances > 0 ? 3 : 0);

          return (
            <div
              key={`${entry.hour}-${entry.channel}`}
              className="timeline-bar"
              style={{ height: `${barHeight}%` }}
              title={`${entry.hour} · ${entry.channel}: ${entry.utterances}`}
            />
          );
        })}
      </div>
      <p className="subtle">Window: latest {histogram.length} hourly channel buckets.</p>
    </section>
  );
};
