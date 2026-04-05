import type { FC, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { chat, fetchDashboard, fetchHealth, fetchPipelineDashboard } from "../api";
import type { DashboardData, HealthData, PipelineDashboardData } from "../api";

const starterQueries = [
  "summarize MER manager activity",
  "what changed in Orion ECLSS today?",
  "which channels discussed timeline risk?",
  "show mentions of comm dropouts"
];

const getPromptDisplay = (
  prompt: PipelineDashboardData["prompts"][number] | undefined,
  defaultMessage: string
): { text: string; statusLabel: string } => {
  if (!prompt) {
    return { text: defaultMessage, statusLabel: "not ready" };
  }

  if (prompt.status === "success" && prompt.output) {
    return { text: prompt.output, statusLabel: "ready" };
  }

  if (prompt.status === "running") {
    return { text: "Querying...", statusLabel: "querying" };
  }

  if (prompt.status === "failed") {
    return { text: "Not ready.", statusLabel: "not ready" };
  }

  return { text: "Building...", statusLabel: "building" };
};

export const DashboardPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineDashboardData | null>(null);
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [chatMode, setChatMode] = useState<ChatMode>("rag");
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      const [dashboardPayload, healthPayload, pipelinePayload] = await Promise.all([
        fetchDashboard(),
        fetchHealth(),
        fetchPipelineDashboard()
      ]);

      setData(dashboardPayload);
      setHealth(healthPayload);
      setPipeline(pipelinePayload);
    };

    void loadData();
    const pollHandle = window.setInterval(() => {
      void loadData();
    }, 10000);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, []);

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
  const missionPrompt = pipeline?.prompts.find((entry) => entry.key === "mission_summary");
  const dailyPrompt = pipeline?.prompts.find((entry) => entry.key === "daily_summary");

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

  const hourlyHistogram = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let hour = 0; hour < 24; hour += 1) {
      buckets[`${hour.toString().padStart(2, "0")}:00`] = 0;
    }

    for (const day of data?.days ?? []) {
      for (const [hour, count] of Object.entries(day.stats.hourlyUtterances ?? {})) {
        buckets[hour] = (buckets[hour] ?? 0) + count;
      }
    }

    const maxBucket = Math.max(...Object.values(buckets), 1);

    return Object.entries(buckets).map(([hour, total]) => ({
      hour,
      total,
      height: `${Math.max((total / maxBucket) * 100, 4)}%`
    }));
  }, [data]);

  return (
    <div className="dashboard-layout">
      <div className="dashboard-toolbar span2">
        {health && !health.llm.connected ? (
          <p className="health-bad">
            LLM Disconnected{health.llm.error ? ` - ${health.llm.error}` : ""}
          </p>
        ) : null}
        <p>Data refreshes automatically when backend starts.</p>
      </div>

      <section className="panel space-panel">
        <h2>Mission Overview</h2>
        {(() => {
          const display = getPromptDisplay(missionPrompt, "Building mission overview...");
          return (
            <>
              <p>{display.text}</p>
              <small className="status-label">Status: {display.statusLabel}</small>
              {missionPrompt?.submittedText ? (
                <>
                  <h3>Submitted Context</h3>
                  <pre>{missionPrompt.submittedText}</pre>
                </>
              ) : null}
            </>
          );
        })()}
      </section>

      <section className="panel space-panel">
        <h2>Stats</h2>
        <table className="stats-table">
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.label}>
                <th scope="row">{stat.label}</th>
                <td>{stat.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel space-panel">
        <h2>Last 24 Hours</h2>
        {(() => {
          const display = getPromptDisplay(dailyPrompt, "Not ready yet.");
          return (
            <>
              <p>{display.text}</p>
              <small className="status-label">Status: {display.statusLabel}</small>
              {dailyPrompt?.submittedText ? (
                <>
                  <h3>Submitted Context</h3>
                  <pre>{dailyPrompt.submittedText}</pre>
                </>
              ) : null}
            </>
          );
        })()}
        <p className="subtle">{latestDay?.day ? `Latest day in cache: ${latestDay.day}` : "No ingested day yet."}</p>
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

      <section className="panel space-panel span2">
        <h2>LLM Query Window</h2>
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">Prompt</th>
              <th scope="col">Status</th>
              <th scope="col">Last Run (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {(pipeline?.prompts ?? []).map((prompt) => (
              <tr key={prompt.id}>
                <th scope="row">{prompt.key}</th>
                <td>{prompt.status}</td>
                <td>{prompt.lastRunAt ?? "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel histogram-panel span2">
        <h2>Communications Over Time</h2>
        <p>Hour buckets aggregated across all ingested days.</p>
        <div className="histogram histogram-hourly">
          {hourlyHistogram.map((bucket) => (
            <article key={bucket.hour} className="histogram-group">
              <div className="bars">
                <div className="bar bar-utterances" style={{ height: bucket.height }} title={`${bucket.total} utterances`} />
              </div>
              <span>{bucket.hour}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
