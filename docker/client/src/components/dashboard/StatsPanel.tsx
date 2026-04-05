import type { FC } from "react";

type StatEntry = {
  label: string;
  value: string;
};

type StatsPanelProps = {
  stats: StatEntry[];
  histogram: Array<{ hour: string; utterances: number }>;
};

export const StatsPanel: FC<StatsPanelProps> = ({ stats, histogram }) => {
  const maxUtterances = Math.max(...histogram.map((entry) => entry.utterances), 1);

  return (
    <section className="panel space-panel">
      <h2>Stats</h2>
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
      <h3>Utterances Per Hour</h3>
      <div className="histogram-grid">
        {histogram.length === 0 ? <p className="subtle">No transcript data yet.</p> : null}
        {histogram.map((entry) => (
          <div key={entry.hour} className="histogram-row">
            <span className="histogram-label">{entry.hour.slice(5, 16).replace("T", " ")}</span>
            <div className="histogram-bar-track">
              <div
                className="histogram-bar-fill"
                style={{ width: `${Math.max((entry.utterances / maxUtterances) * 100, entry.utterances > 0 ? 2 : 0)}%` }}
              />
            </div>
            <span className="histogram-value">{entry.utterances}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
