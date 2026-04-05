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

type PromptCardConfig = {
  key: string;
  title: string;
  defaultMessage: string;
};

const promptCards: PromptCardConfig[] = [
  { key: "mission_summary", title: "Mission Overview", defaultMessage: "Building mission overview..." },
  { key: "recent_changes", title: "What Changed", defaultMessage: "Querying recent changes..." },
  { key: "daily_summary", title: "Last 24 Hours", defaultMessage: "Not ready yet." }
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
  const [chatAnswer, setChatAnswer] = useState("");

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
    const result = await chat(chatInput);
    setChatAnswer(result.answer);
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
          const prompt = pipeline?.prompts.find((entry) => entry.key === "mission_summary");
          const display = getPromptDisplay(prompt, "Building mission overview...");
          return (
            <>
              <p>{display.text}</p>
              <small className="status-label">Status: {display.statusLabel}</small>
            </>
          );
        })()}
      </section>

      <section className="panel space-panel">
        <h2>Stats</h2>
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
        {(() => {
          const prompt = pipeline?.prompts.find((entry) => entry.key === "daily_summary");
          const display = getPromptDisplay(prompt, "Not ready yet.");
          return (
            <>
              <p>{display.text}</p>
              <small className="status-label">Status: {display.statusLabel}</small>
            </>
          );
        })()}
        <p className="subtle">{latestDay?.day ? `Latest day in cache: ${latestDay.day}` : "No ingested day yet."}</p>
      </section>

      <section className="panel space-panel">
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

      <section className="panel space-panel span2">
        <h2>Prompt Workflow</h2>
        <div className="prompt-grid">
          {promptCards.map((card) => {
            const prompt = pipeline?.prompts.find((entry) => entry.key === card.key);
            const display = getPromptDisplay(prompt, card.defaultMessage);
            return (
              <article key={card.key} className="metric-card">
                <span>{card.title}</span>
                <strong>{display.statusLabel}</strong>
                <p>{display.text}</p>
              </article>
            );
          })}
        </div>
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
