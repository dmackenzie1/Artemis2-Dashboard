import type { FC } from "react";
import { useEffect, useState } from "react";

export const TimelinePage: FC = () => {
  const [timeline, setTimeline] = useState<Array<{ day: string; summary: string; topics: string[] }>>([]);

  useEffect(() => {
    void fetch("/api/timeline")
      .then((response) => response.json())
      .then((payload) => setTimeline(payload as Array<{ day: string; summary: string; topics: string[] }>));
  }, []);

  return (
    <div className="stack">
      {timeline.map((entry) => (
        <section className="panel" key={entry.day}>
          <h2>{entry.day}</h2>
          <p>{entry.summary}</p>
          <p>Topics: {entry.topics.join(", ")}</p>
        </section>
      ))}
    </div>
  );
};
