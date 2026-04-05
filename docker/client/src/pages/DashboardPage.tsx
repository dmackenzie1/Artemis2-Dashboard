import type { FC, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { chat, fetchDashboard, fetchHealth, triggerIngest } from "../api";
import type { DashboardData, HealthData } from "../api";

const starterQueries = [
  "summarize MER manager activity",
  "what changed in Orion ECLSS today?",
  "which channels discussed timeline risk?",
  "show mentions of comm dropouts"
];

export const DashboardPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [chatAnswer, setChatAnswer] = useState("");

  const loadStartupData = async (): Promise<void> => {
    const [dashboardPayload, healthPayload] = await Promise.all([fetchDashboard(), fetchHealth()]);
    setData(dashboardPayload);
    setHealth(healthPayload);
  };

  useEffect(() => {
    void loadStartupData();
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
        <p className={health?.llm.connected ? "health-ok" : "health-bad"}>
          LLM Connectivity:{" "}
          {health?.llm.connected
            ? `Connected (${health.llm.model ?? "unknown model"})`
            : `Disconnected${health?.llm.error ? ` - ${health.llm.error}` : ""}`}
        </p>
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
        <div className="query-chip-row">
          {starterQueries.map((query) => (
            <button key={query} type="button" onClick={() => setChatInput(query)}>
              {query}
            </button>
          ))}
        </div>
        <pre>{chatAnswer || "Ask about systems, anomalies, channels, or timeline changes."}</pre>
      </section>
    </div>
  );
};
