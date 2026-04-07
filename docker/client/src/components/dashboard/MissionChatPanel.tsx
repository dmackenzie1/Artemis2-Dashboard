import type { FunctionComponent, FormEvent } from "react";
import { useState } from "react";
import { chat } from "../../api";
import styles from "./MissionChatPanel.module.css";
import type { ChatMessage } from "./types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { LoadingIndicator } from "./primitives/LoadingIndicator";
import { StatusBadge } from "./primitives/StatusBadge";
import { useComponentIdentity } from "./primitives/useComponentIdentity";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";
import { clientLogger } from "../../utils/logging/clientLogger";

const starterQueries = [
  "review key developments from the daily page for the latest transcript window",
  "what changed in Orion ECLSS in the latest reviewed day?",
  "review timeline risks over the most recent flight day",
  "show mentions of comm dropouts in transcript context"
];

export const MissionChatPanel: FunctionComponent = () => {
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  useComponentIdentity("mission-chat-panel");

  const onChatSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const trimmed = chatInput.trim();
    if (!trimmed || isThinking) {
      return;
    }

    setChatMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setIsThinking(true);

    try {
      const result = await chat(trimmed);
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

  return (
    <DashboardPanel
      componentId="mission-chat-panel"
      className={styles["mission-chat-panel"]}
      kicker="Intelligence Interface"
      title="Query Console"
      headerAccessory={<StatusBadge label={isThinking ? "Working" : "Ready"} />}
    >
      <div className={styles["chat-layout"]}>
        <div className={styles["chat-window"]} role="log" aria-live="polite">
          {!isThinking && chatMessages.length === 0 ? (
            <p className={styles["chat-empty"]}>No chat results yet. Submit a query to populate this window.</p>
          ) : null}
          {chatMessages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`${styles["chat-bubble"]} ${message.role === "user" ? styles["chat-user"] : styles["chat-assistant"]}`}
            >
              <header>{message.role === "user" ? "Operator" : "Mission Analyst"}</header>
              <div className={styles["chat-copy"]}>
                {message.role === "assistant" ? renderStructuredText(message.text, styles["chat-list"]) : <p>{message.text}</p>}
              </div>
              {message.strategy ? (
                <small>
                  Multi-day query · {message.strategy.daysQueried} days · {message.strategy.contextUtterances}/
                  {message.strategy.totalUtterances} utterances
                </small>
              ) : null}
            </article>
          ))}
          {isThinking ? <LoadingIndicator variant="console" message="Waiting for results…" /> : null}
        </div>

        <form onSubmit={(event) => void onChatSubmit(event)} className={`${styles["chat-form"]} ${styles["chat-window-form"]}`}>
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            rows={3}
            placeholder="Ask a question about the transcripts."
          />
          <button type="submit" disabled={isThinking || !chatInput.trim()}>
            {isThinking ? "Working..." : "Search"}
          </button>
        </form>
      </div>
    </DashboardPanel>
  );
};
