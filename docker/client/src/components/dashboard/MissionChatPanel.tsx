import type { FunctionComponent, FormEvent } from "react";
import styles from "./MissionChatPanel.module.css";
import type { ChatMessage } from "./types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { LoadingIndicator } from "./primitives/LoadingIndicator";
import { StatusBadge } from "./primitives/StatusBadge";
import { useComponentIdentity } from "./primitives/useComponentIdentity";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";

type MissionChatPanelProps = {
  chatInput: string;
  isThinking: boolean;
  chatMessages: ChatMessage[];
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const MissionChatPanel: FunctionComponent<MissionChatPanelProps> = ({
  chatInput,
  isThinking,
  chatMessages,
  onChatInputChange,
  onChatSubmit
}) => {
  useComponentIdentity("mission-chat-panel");

  return (
    <DashboardPanel
      componentId="mission-chat-panel"
      className={styles["mission-chat-panel"]}
      kicker="Intelligence Interface"
      title="Query Console"
      headerAccessory={
        <StatusBadge label={isThinking ? "Working" : "Ready"} />
      }
    >
      <div className={styles["chat-layout"]}>
        <div className={styles["chat-window"]} role="log" aria-live="polite">
          {!isThinking && chatMessages.length === 0 ? (
            <p className={styles["chat-empty"]}>No chat results yet. Submit a query to populate this window.</p>
          ) : null}
          {chatMessages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`${styles["chat-bubble"]} ${
                message.role === "user" ? styles["chat-user"] : styles["chat-assistant"]
              }`}
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
            onChange={(event) => onChatInputChange(event.target.value)}
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
