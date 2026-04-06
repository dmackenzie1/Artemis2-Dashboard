import type { FC } from "react";
import { useEffect, useState } from "react";
import { fetchDashboard, type DashboardData } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "../styles.module.css";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";

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
          <div className={styles["formatted-copy"]}>{renderStructuredText(day.summary, styles["formatted-list"])}</div>
          <p>
            Utterances: {day.stats.utteranceCount} | Words: {day.stats.wordCount} | Channels: {day.stats.channelCount}
          </p>
          <h3>Hourly Highlights</h3>
          <div className={styles["hourly-highlight-grid"]}>
            {Object.entries(day.hourly).map(([hour, summary]) => (
              <section className={styles["hourly-highlight-card"]} key={hour}>
                <p className={styles["hourly-highlight-hour"]}>{hour}</p>
                <div className={styles["formatted-copy"]}>{renderStructuredText(summary, styles["formatted-list"])}</div>
              </section>
            ))}
          </div>
        </article>
      )) ?? <p>No data yet. Trigger ingestion on Overview page.</p>}
    </div>
  );
};
