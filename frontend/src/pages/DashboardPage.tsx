import type { FC, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { chat, fetchDashboard, triggerIngest, type DashboardData } from "../api";

export const DashboardPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [chatInput, setChatInput] = useState("summarize MER manager activity");
  const [chatAnswer, setChatAnswer] = useState("");

  const loadData = async (): Promise<void> => {
    const payload = await fetchDashboard();
    setData(payload);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onIngest = async (): Promise<void> => {
    const payload = await triggerIngest();
    setData(payload);
  };

  const onChat = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const result = await chat(chatInput);
    setChatAnswer(result.answer);
  };

  const latestDay = data?.days[data.days.length - 1];

  return (
    <div className="grid">
      <section className="panel span2">
        <div className="panel-header">
          <h2>Mission Overview</h2>
          <button onClick={() => void onIngest()}>Rebuild from CSV folder</button>
        </div>
        <p>{data?.missionSummary ?? "Run ingestion to generate mission intelligence."}</p>
      </section>

      <section className="panel">
        <h2>Latest Summary</h2>
        <p>{latestDay?.summary ?? "No daily summaries yet."}</p>
      </section>

      <section className="panel">
        <h2>What Changed Recently</h2>
        <p>{data?.recentChanges ?? "No recent trend analysis yet."}</p>
      </section>

      <section className="panel">
        <h2>Daily Topics</h2>
        <ul>
          {latestDay?.topics.map((topic) => (
            <li key={topic.title}>
              <Link to={`/topics/${encodeURIComponent(topic.title)}`}>{topic.title}</Link>
            </li>
          )) ?? <li>Run ingestion to generate topics.</li>}
        </ul>
      </section>

      <section className="panel span2">
        <h2>Search + Chat</h2>
        <form onSubmit={(event) => void onChat(event)} className="chat-form">
          <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} />
          <button type="submit">Ask</button>
        </form>
        <pre>{chatAnswer || "Ask about systems, anomalies, channels, or timeline changes."}</pre>
      </section>
    </div>
  );
};
