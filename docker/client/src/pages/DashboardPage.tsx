import type { FC, FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { chat, fetchDashboard, fetchHealth, triggerIngest } from "../api";
import type { ChatMode, ChatResponse, DashboardData, HealthData } from "../api";
import { clientLogger } from "../utils/logging/clientLogger";

const starterQueries = [
  "summarize MER manager activity",
  "what changed in Orion ECLSS today?",
  "which channels discussed timeline risk?",
  "show mentions of comm dropouts"
];

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  strategy?: ChatResponse["strategy"];
};

export const DashboardPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [chatMode, setChatMode] = useState<ChatMode>("rag");
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const loadStartupData = async (): Promise<void> => {
    const [dashboardPayload, healthPayload] = await Promise.all([fetchDashboard(), fetchHealth()]);
    setData(dashboardPayload);
    setHealth(healthPayload);
  };

  useEffect(() => {
    void loadStartupData();
  }, []);

  const onIngest = async (): Promise<void> => {
    clientLogger.info("Dashboard ingest button clicked");
    const payload = await triggerIngest();
    setData(payload);
  };

  const onChat = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const trimmed = chatInput.trim();
    if (!trimmed || isThinking) {
      return;
    }

    setChatMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setIsThinking(true);

    try {
      const result = await chat(trimmed, chatMode);
      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: result.answer,
          strategy: result.strategy
        }
      ]);
    } catch (error) {
      clientLogger.error("Chat request failed", { error });
      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: "Unable to run chat right now. Please verify LLM connectivity and try again." }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const latestDay = data?.days[data.days.length - 1];

  const stats = useMemo(() => {
    const totals = data?.days.reduce(
      (acc, currentDay) => {
        acc.utterances += currentDay.stats.utteranceCount;
        acc.words += currentDay.stats.wordCount;
        acc.channels += currentDay.stats.channelCount;
        return acc;
      },
      { utterances: 0, words: 0, channels: 0 }
    );

    return [
      { label: "Data Days", value: `${data?.days.length ?? 0}` },
      { label: "Utterances", value: `${totals?.utterances ?? 0}` },
      { label: "Words", value: `${totals?.words ?? 0}` },
      { label: "Avg Channels/Day", value: `${Math.round((totals?.channels ?? 0) / Math.max(data?.days.length ?? 1, 1))}` }
    ];
  }, [data]);

  const histogramData = useMemo(() => {
    const maxUtterances = Math.max(...(data?.days.map((day) => day.stats.utteranceCount) ?? [1]));
    const maxChannels = Math.max(...(data?.days.map((day) => day.stats.channelCount) ?? [1]));

    return (
      data?.days.map((day) => ({
        day: day.day,
        utteranceHeight: `${Math.max((day.stats.utteranceCount / maxUtterances) * 100, 8)}%`,
        channelHeight: `${Math.max((day.stats.channelCount / maxChannels) * 100, 8)}%`,
        utterances: day.stats.utteranceCount,
        channels: day.stats.channelCount
      })) ?? []
    );
  }, [data]);

  return (
    <div className="dashboard-layout">
      <div className="dashboard-toolbar">
        <div className="toolbar-links">
          <Link to="/daily">Review Daily</Link>
          <Link to="/timeline">Review Timeline</Link>
          <button type="button" onClick={() => void onIngest()}>
            Rebuild from CSV folder
          </button>
        </div>
        <p className={health?.llm.connected ? "health-ok" : "health-bad"}>
          LLM Connectivity:{" "}
          {health?.llm.connected
            ? "Connected"
            : `Disconnected${health?.llm.error ? ` - ${health.llm.error}` : ""}`}
        </p>
        <p>{data?.missionSummary ?? "Run ingestion to generate mission intelligence."}</p>
      </div>

      <section className="panel space-panel">
        <h2>Mission Overview</h2>
        <p>{data?.missionSummary ?? "Run ingestion to generate the latest Artemis 2 communications intelligence."}</p>
        <div className="overview-metrics">
          {stats.map((stat) => (
            <article key={stat.label} className="metric-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="panel space-panel">
        <h2>Last 24 Hours</h2>
        <p>{latestDay?.summary ?? "No daily summaries yet."}</p>
      </section>

      <section className="panel space-panel">
        <h2>Daily Topics</h2>
        <ul>
          {latestDay?.topics.map((topic) => (
            <li key={topic.title}>
              <Link to={`/topics/${encodeURIComponent(topic.title)}`}>{topic.title}</Link>
            </li>
          )) ?? <li>Run ingestion to generate topics.</li>}
        </ul>
      </section>

      <section className="panel space-panel">
        <h2>Channel Snapshot</h2>
        <p>
          {latestDay
            ? `${latestDay.stats.channelCount} active channels and ${latestDay.stats.utteranceCount} communications observed on ${latestDay.day}.`
            : "Ingest CSV files to populate channel activity."}
        </p>
      </section>

      <section className="panel space-panel">
        <h2>What Changed Recently</h2>
        <p>{data?.recentChanges ?? "No recent trend analysis yet."}</p>
      </section>

      <section className="panel space-panel span2 chat-window-panel">
        <div className="chat-panel-header">
          <h2>Mission Chat</h2>
          <label className="chat-mode-picker" htmlFor="chat-mode">
            Context Mode
            <select id="chat-mode" value={chatMode} onChange={(event) => setChatMode(event.target.value as ChatMode)}>
              <option value="rag">Targeted Retrieval (RAG-style)</option>
              <option value="all">Broad Sweep (largest context slice)</option>
            </select>
          </label>
        </div>

        <p className="chat-helper-text">
          Targeted retrieval is faster and safer for large transcript sets. Broad sweep sends a much larger context sample so the model can decide what matters.
        </p>

        <div className="chat-window" role="log" aria-live="polite">
          {chatMessages.length === 0 ? <p className="chat-empty">Ask about systems, anomalies, channels, or timeline changes.</p> : null}
          {chatMessages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`chat-bubble ${message.role === "user" ? "chat-user" : "chat-assistant"}`}>
              <header>{message.role === "user" ? "You" : "Mission Analyst"}</header>
              <p>{message.text}</p>
              {message.strategy ? (
                <small>
                  Mode: {message.strategy.mode} · Context {message.strategy.contextUtterances}/{message.strategy.totalUtterances}
                  {message.strategy.wasTruncated ? " · truncated for token safety" : ""}
                </small>
              ) : null}
            </article>
          ))}
          {isThinking ? <article className="chat-bubble chat-assistant thinking-bubble">thinking</article> : null}
        </div>

        <form onSubmit={(event) => void onChat(event)} className="chat-form chat-window-form">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            rows={3}
            placeholder="Type your mission question..."
          />
          <button type="submit" disabled={isThinking || !chatInput.trim()}>
            Submit
          </button>
        </form>

        <div className="query-chip-row">
          {starterQueries.map((query) => (
            <button key={query} type="button" onClick={() => setChatInput(query)}>
              {query}
            </button>
          ))}
        </div>
      </section>

      <section className="panel histogram-panel span2">
        <h2>Communications Over Time</h2>
        <p>Daily trend view by total communications and active channels.</p>
        <div className="histogram">
          {histogramData.length > 0 ? (
            histogramData.map((day) => (
              <article key={day.day} className="histogram-group">
                <div className="bars">
                  <div className="bar bar-utterances" style={{ height: day.utteranceHeight }} title={`${day.utterances} utterances`} />
                  <div className="bar bar-channels" style={{ height: day.channelHeight }} title={`${day.channels} channels`} />
                </div>
                <span>{day.day}</span>
              </article>
            ))
          ) : (
            <div className="histogram-empty">Run ingestion to render communication activity.</div>
          )}
        </div>
      </section>
    </div>
  );
};
