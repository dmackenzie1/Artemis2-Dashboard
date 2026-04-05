import type { FC } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

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

  useEffect(() => {
    void fetch(`/api/topics/${title}`)
      .then((response) => response.json())
      .then((payload) => setTopic(payload as TopicDetails));
  }, [title]);

  if (!topic) {
    return <p>Loading topic intelligence...</p>;
  }

  return (
    <article className="panel">
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
