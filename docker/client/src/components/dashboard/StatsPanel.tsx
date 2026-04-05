import type { FC } from "react";

type StatEntry = {
  label: string;
  value: string;
};

type StatsPanelProps = {
  stats: StatEntry[];
};

export const StatsPanel: FC<StatsPanelProps> = ({ stats }) => {
  return (
    <section className="panel space-panel stats-panel">
      <p className="panel-kicker">Snapshot</p>
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
    </section>
  );
};
