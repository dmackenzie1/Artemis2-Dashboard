import type { FC } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./TopicPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";

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
    let isMounted = true;
    setTopic(null);

    const loadTopic = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/topics/${encodeURIComponent(title)}`);
        if (!response.ok) {
          throw new Error(`Unable to load topic: ${response.status}`);
        }

        const payload = (await response.json()) as TopicDetails;
        if (isMounted) {
          setTopic(payload);
        }
      } catch (error) {
        clientLogger.error("Failed to load topic details", { error, title });
      }
    };

    void loadTopic();

    return () => {
      isMounted = false;
    };
  }, [title]);

  if (!topic) {
    return (
      <p data-component-id={componentId} data-component-uid={componentUid}>
        Loading topic intelligence...
      </p>
    );
  }

  return (
    <article className={`${sharedStyles.panel} ${styles["topic-panel"]}`} data-component-id={componentId} data-component-uid={componentUid}>
      <h2>{topic.title}</h2>
      <p>{topic.description}</p>
      <p>First seen day: {topic.day.day}</p>
      <p>Channels: {topic.channels.join(", ") || "TBD by model"}</p>
      <ul>
        {topic.mentionTimestamps.map((timestamp) => (
          <li key={timestamp}>
            {timestamp} -{" "}
            <a href="https://talkybot.fit.nasa.gov/" target="_blank" rel="noreferrer">
              Open in TalkyBot
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
};
