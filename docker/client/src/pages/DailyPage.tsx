import type { FC } from "react";
import { useEffect, useState } from "react";
import { fetchDashboard, type DashboardData } from "../api";

export const DailyPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void fetchDashboard().then((payload) => setData(payload));
  }, []);

  return (
    <div className="stack">
      {data?.days.map((day) => (
        <article className="panel" key={day.day}>
          <h2>{day.day}</h2>
          <p>{day.summary}</p>
          <p>
            Utterances: {day.stats.utteranceCount} | Words: {day.stats.wordCount} | Channels: {day.stats.channelCount}
          </p>
          <h3>Hourly Highlights</h3>
          <ul>
            {Object.entries(day.hourly).map(([hour, summary]) => (
              <li key={hour}>
                <strong>{hour}</strong> - {summary}
              </li>
            ))}
          </ul>
        </article>
      )) ?? <p>No data yet. Trigger ingestion on Overview page.</p>}
    </div>
  );
};
