import type { FunctionComponent, FormEvent } from "react";
import styles from "../../styles.module.css";
import type { ChatMessage } from "./types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { LoadingIndicator } from "./primitives/LoadingIndicator";
import { useComponentIdentity } from "./primitives/useComponentIdentity";

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
  const { componentUid } = useComponentIdentity("mission-chat-panel");

  return (
    <DashboardPanel
      componentId="mission-chat-panel"
      className={styles["mission-chat-panel"]}
      kicker="Intelligence Interface"
      title="Query Console"
      headerAccessory={
        <button
          type="button"
          className={styles["query-console-ready-button"]}
          aria-label={`Query console status ${componentUid}`}
          disabled
        >
          {isThinking ? "Working" : "Ready"}
        </button>
      }
    >
      <div className={styles["chat-window"]} role="log" aria-live="polite">
        {chatMessages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={`${styles["chat-bubble"]} ${
              message.role === "user" ? styles["chat-user"] : styles["chat-assistant"]
            }`}
          >
            <header>{message.role === "user" ? "Operator" : "Mission Analyst"}</header>
            <p>{message.text}</p>
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
    </DashboardPanel>
  );
};
