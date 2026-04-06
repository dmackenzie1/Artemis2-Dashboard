import type { FC, FormEvent } from "react";
import { useMemo, useState } from "react";
import { chat, type ChatMode, type ChatResponse } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./TalkieRagPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";

type LookupResult = {
  id: string;
  score: number;
  timestamp: string;
  channel: string;
  text: string;
  filename: string;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3);

const buildLookupResults = (query: string, payload: ChatResponse, maxResults: number): LookupResult[] => {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return payload.evidence.slice(0, maxResults).map((entry, index) => ({
      id: `${entry.timestamp}-${entry.channel}-${index}`,
      score: 0,
      timestamp: entry.timestamp,
      channel: entry.channel,
      text: entry.text,
      filename: entry.filename
    }));
  }

  return payload.evidence
    .map((entry, index) => {
      const entryTokens = new Set(tokenize(entry.text));
      const overlap = [...queryTokens].filter((token) => entryTokens.has(token)).length;
      const normalizedScore = overlap / queryTokens.size;
      return {
        id: `${entry.timestamp}-${entry.channel}-${index}`,
        score: Number(normalizedScore.toFixed(3)),
        timestamp: entry.timestamp,
        channel: entry.channel,
        text: entry.text,
        filename: entry.filename
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);
};

export const TalkieRagPage: FC = () => {
  const { componentId, componentUid } = useComponentIdentity("talkierag-page");
  const [query, setQuery] = useState("Summarize ECLSS risk mentions for the latest day and explain the operational impact.");
  const [mode, setMode] = useState<ChatMode>("rag");
  const [isRunning, setIsRunning] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [strategySummary, setStrategySummary] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const resultCountLabel = useMemo(() => `${lookupResults.length} retrieved snippet${lookupResults.length === 1 ? "" : "s"}`, [lookupResults.length]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isRunning) {
      return;
    }

    setIsRunning(true);
    setError(null);
    setAnswer(null);
    setStrategySummary(null);
    setLookupResults([]);

    try {
      const payload = await chat(trimmed, mode);
      setAnswer(payload.answer);
      setStrategySummary(
        `${payload.strategy.mode} · ${payload.strategy.contextUtterances}/${payload.strategy.totalUtterances} utterances · ${payload.strategy.daysQueried} days`
      );
      setLookupResults(buildLookupResults(trimmed, payload, 20));
    } catch (submitError) {
      clientLogger.error("TalkieRAG request failed", { error: submitError });
      setError("TalkieRAG query failed. Verify backend connectivity and try again.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className={styles["talkierag-page"]} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={sharedStyles["timeline-header"]}>
        <p className={sharedStyles["timeline-kicker"]}>Semantic Console</p>
        <h2>TalkieRAG</h2>
        <p className={sharedStyles["timeline-subtitle"]}>
          Full-page retrieval workflow: run lookup against transcript evidence, then synthesize an answer using the current chat API.
        </p>
      </header>

      <form onSubmit={(event) => void onSubmit(event)} className={styles["talkierag-form"]}>
        <label htmlFor="talkierag-query">Question</label>
        <textarea
          id="talkierag-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          rows={4}
          placeholder="Ask mission review questions using transcript context."
        />
        <div className={styles["talkierag-controls"]}>
          <label htmlFor="talkierag-mode">Mode</label>
          <select id="talkierag-mode" value={mode} onChange={(event) => setMode(event.target.value as ChatMode)}>
            <option value="rag">RAG</option>
            <option value="all">All Context</option>
          </select>
          <button type="submit" disabled={isRunning || !query.trim()}>
            {isRunning ? "Searching..." : "Run TalkieRAG"}
          </button>
        </div>
      </form>

      {error ? <p className={sharedStyles["timeline-error"]}>{error}</p> : null}

      <section className={styles["talkierag-layout"]}>
        <article className={sharedStyles.panel}>
          <h3>Answer</h3>
          {strategySummary ? <p className={sharedStyles.subtle}>Strategy: {strategySummary}</p> : null}
          <div className={sharedStyles["formatted-copy"]}>
            <p>{answer ?? (isRunning ? "Running query..." : "Run a TalkieRAG query to generate an answer.")}</p>
          </div>
        </article>

        <article className={sharedStyles.panel}>
          <h3>Retrieved Evidence</h3>
          <p className={sharedStyles.subtle}>{resultCountLabel}</p>
          <ul className={styles["talkierag-results"]}>
            {lookupResults.map((entry) => (
              <li key={entry.id} className={styles["talkierag-result-card"]}>
                <header>
                  <strong>{entry.channel}</strong>
                  <span>{entry.timestamp}</span>
                </header>
                <p>{entry.text}</p>
                <footer>
                  <small>{entry.filename}</small>
                  <small>score {entry.score.toFixed(3)}</small>
                </footer>
              </li>
            ))}
          </ul>
          {!isRunning && lookupResults.length === 0 ? (
            <p className={sharedStyles.subtle}>No matching snippets yet. Try a narrower query (channel, subsystem, issue type, or timeframe).</p>
          ) : null}
        </article>
      </section>
    </section>
  );
};
