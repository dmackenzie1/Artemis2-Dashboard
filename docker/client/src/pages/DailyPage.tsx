import type { FC } from "react";
import { useEffect, useState } from "react";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import { fetchDashboard, type DashboardData } from "../api";
import styles from "../styles.module.css";

export const DailyPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const { componentId, componentUid } = useComponentIdentity("daily-page");

  useEffect(() => {
    void fetchDashboard().then((payload) => setData(payload));
  }, []);

  return (
    <div className={styles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      {data?.days.map((day) => (
        <article className={styles.panel} key={day.day} data-component-id="daily-day-panel" data-component-uid={`${componentUid}-${day.day}`}>
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
