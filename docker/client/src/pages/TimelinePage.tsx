import type { FC } from "react";
import { useEffect, useState } from "react";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "../styles.module.css";

export const TimelinePage: FC = () => {
  const [timeline, setTimeline] = useState<Array<{ day: string; summary: string; topics: string[] }>>([]);
  const { componentId, componentUid } = useComponentIdentity("timeline-page");

  useEffect(() => {
    void fetch("/api/timeline")
      .then((response) => response.json())
      .then((payload) => setTimeline(payload as Array<{ day: string; summary: string; topics: string[] }>));
  }, []);

  return (
    <div className={styles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      {timeline.map((entry) => (
        <section className={styles.panel} key={entry.day} data-component-id="timeline-day-panel" data-component-uid={`${componentUid}-${entry.day}`}>
          <h2>{entry.day}</h2>
          <p>{entry.summary}</p>
          <p>Topics: {entry.topics.join(", ")}</p>
        </section>
      ))}
    </div>
  );
};
