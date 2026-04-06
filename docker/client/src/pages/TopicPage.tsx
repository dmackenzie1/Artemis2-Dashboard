import type { FC } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "../styles.module.css";

type TopicDetails = {
  title: string;
  description: string;
  channels: string[];
  mentionTimestamps: string[];
  day: {
    day: string;
  };
};

export const TopicPage: FC = () => {
  const { title = "" } = useParams();
  const [topic, setTopic] = useState<TopicDetails | null>(null);
  const { componentId, componentUid } = useComponentIdentity("topic-page");

  useEffect(() => {
    void fetch(`/api/topics/${title}`)
      .then((response) => response.json())
      .then((payload) => setTopic(payload as TopicDetails));
  }, [title]);

  if (!topic) {
    return (
      <p data-component-id={componentId} data-component-uid={componentUid}>
        Loading topic intelligence...
      </p>
    );
  }

  return (
    <article className={styles.panel} data-component-id={componentId} data-component-uid={componentUid}>
      <h2>{topic.title}</h2>
      <p>{topic.description}</p>
      <p>First seen day: {topic.day.day}</p>
      <p>Channels: {topic.channels.join(", ") || "TBD by model"}</p>
      <ul>
        {topic.mentionTimestamps.map((timestamp) => (
          <li key={timestamp}>
            {timestamp} - <a href="#">Talkybot Link Placeholder</a>
          </li>
        ))}
      </ul>
    </article>
  );
};
