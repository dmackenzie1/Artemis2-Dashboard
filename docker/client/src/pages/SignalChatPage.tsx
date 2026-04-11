import type { FunctionComponent, FormEvent } from "react";
import { useMemo, useState } from "react";
import { chat, searchUtterances, type ChatMode, type ChatResponse, type UtteranceSearchResponse } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./SignalChatPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";

const DEFAULT_QUERY = "Summarize communication risks in the latest transcript windows.";

export const SignalChatPage: FunctionComponent = () => {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [mode, setMode] = useState<ChatMode>("rag_chat");
  const [isThinking, setIsThinking] = useState(false);
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [searchResponse, setSearchResponse] = useState<UtteranceSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { componentId, componentUid } = useComponentIdentity("signal-chat-page");

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed || isThinking) {
      return;
    }

    setError(null);
    setIsThinking(true);

    try {
      const [searchPayload, chatPayload] = await Promise.all([searchUtterances(trimmed, 10), chat(trimmed, mode)]);
      setSearchResponse(searchPayload);
      setChatResponse(chatPayload);
    } catch (requestError) {
      clientLogger.error("Signal chat request failed", { error: requestError, mode });
      setSearchResponse(null);
      setChatResponse(null);
      setError("Unable to retrieve Signal Chat results right now.");
    } finally {
      setIsThinking(false);
    }
  };

  const queryTokenLabel = useMemo(() => {
    if (!searchResponse) {
      return "(none)";
    }
    return searchResponse.queryTokens.join(", ") || "(none)";
  }, [searchResponse]);

  return (
    <section className={styles.shell} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={styles.header}>
        <div>
          <p className={sharedStyles["timeline-kicker"]}>Mission Workspace</p>
          <h2>Signal Chat</h2>
          <p className={sharedStyles["timeline-subtitle"]}>Ask mission questions and review ranked transcript evidence side-by-side.</p>
        </div>
      </header>

      {error ? <p className={sharedStyles["timeline-error"]}>{error}</p> : null}

      <section className={styles.workspace}>
        <article className={`${sharedStyles.panel} ${styles["chat-log"]}`}>
          <h3>Chat Log</h3>
          {!chatResponse && !isThinking ? (
            <p className={sharedStyles.subtle}>No answer yet. Submit a query to start the search flow.</p>
          ) : null}
          {isThinking ? <p className={sharedStyles.subtle}>Synthesizing response from ranked evidence…</p> : null}
          {chatResponse ? (
            <>
              <p className={styles.strategy}>
                mode={chatResponse.strategy.mode} • days={chatResponse.strategy.daysQueried} • context=
                {chatResponse.strategy.contextUtterances}/{chatResponse.strategy.totalUtterances}
              </p>
              <div className={`${sharedStyles["formatted-copy"]} ${styles.answer}`}>
                {renderStructuredText(chatResponse.answer, sharedStyles["formatted-list"])}
              </div>
            </>
          ) : null}
        </article>

        <article className={`${sharedStyles.panel} ${styles.evidence}`}>
          <h3>Evidence</h3>
          {!searchResponse && !isThinking ? <p className={sharedStyles.subtle}>Evidence appears here after retrieval.</p> : null}
          {searchResponse ? (
            <p className={styles.strategy}>
              tokens={queryTokenLabel} • results={searchResponse.resultCount}
            </p>
          ) : null}
          <ul className={styles["evidence-list"]}>
            {(searchResponse?.utterances ?? []).map((entry, index) => (
              <li key={`${entry.timestamp}-${entry.channel}-${index}`} className={styles["evidence-item"]}>
                <header>
                  <strong>{entry.timestamp}</strong>
                  <span>{entry.channel}</span>
                </header>
                <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(entry.text, sharedStyles["formatted-list"])}</div>
                <small>
                  day={entry.day} • score={entry.score.toFixed(4)} • file={entry.filename} • source={entry.source}
                </small>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <article className={`${sharedStyles.panel} ${styles.composer}`}>
        <form className={styles["chat-form"]} onSubmit={(event) => void onSubmit(event)}>
          <label className={styles["field-label"]} htmlFor="signal-chat-query">
            Chat Prompt
          </label>
          <textarea
            id="signal-chat-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={styles.textarea}
            placeholder="Ask about anomalies, decisions, and mission signals."
            rows={3}
          />
          <div className={styles["form-row"]}>
            <label className={styles["field-label"]} htmlFor="signal-chat-mode">
              Mode
            </label>
            <select id="signal-chat-mode" value={mode} onChange={(event) => setMode(event.target.value as ChatMode)}>
              <option value="rag_chat">RAG Chat</option>
              <option value="llm_chat">LLM Chat</option>
            </select>
            <button type="submit" disabled={isThinking || query.trim().length === 0}>
              {isThinking ? "Thinking…" : "Chat"}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
};
