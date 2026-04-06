import type { FunctionComponent, FormEvent } from "react";
import type { ChatMode } from "../../api";
import styles from "../../styles.module.css";
import type { ChatMessage } from "./types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { LoadingIndicator } from "./primitives/LoadingIndicator";
import { StatusBadge } from "./primitives/StatusBadge";
import { useComponentIdentity } from "./primitives/useComponentIdentity";

type MissionChatPanelProps = {
  chatInput: string;
  chatMode: ChatMode;
  isThinking: boolean;
  chatMessages: ChatMessage[];
  onChatInputChange: (value: string) => void;
  onChatModeChange: (value: ChatMode) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const MissionChatPanel: FunctionComponent<MissionChatPanelProps> = ({
  chatInput,
  chatMode,
  isThinking,
  chatMessages,
  onChatInputChange,
  onChatModeChange,
  onChatSubmit
}) => {
  const { componentUid } = useComponentIdentity("mission-chat-panel");

  const modePicker = (
    <div className={styles["chat-mode-picker"]}>
      <span>Context Mode</span>
      <div className={styles["chat-mode-toggle"]} role="group" aria-label={`Chat context mode ${componentUid}`}>
        <button
          type="button"
          className={`${styles["chat-mode-pill"]} ${chatMode === "rag" ? styles["chat-mode-pill-active"] : ""}`.trim()}
          onClick={() => onChatModeChange("rag")}
          aria-pressed={chatMode === "rag"}
        >
          Targeted Retrieval
        </button>
        <button
          type="button"
          className={`${styles["chat-mode-pill"]} ${chatMode === "all" ? styles["chat-mode-pill-active"] : ""}`.trim()}
          onClick={() => onChatModeChange("all")}
          aria-pressed={chatMode === "all"}
        >
          Broad Sweep
        </button>
      </div>
    </div>
  );

  return (
    <DashboardPanel
      componentId="mission-chat-panel"
      className={styles["mission-chat-panel"]}
      kicker="Intelligence Interface"
      title="Mission Query Console"
      headerAccessory={modePicker}
      footer={<StatusBadge label={isThinking ? "querying" : "ready"} />}
    >
      <div className={styles["chat-window"]} role="log" aria-live="polite">
        {chatMessages.length === 0 ? (
          <p className={styles["chat-empty"]}>Ask about anomalies, channels, timeline changes, or mission readiness.</p>
        ) : null}
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
                Mode: {message.strategy.mode} · Context {message.strategy.contextUtterances}/{message.strategy.totalUtterances}
                {message.strategy.wasTruncated ? " · truncated" : ""}
              </small>
            ) : null}
          </article>
        ))}
        {isThinking ? <LoadingIndicator variant="console" message="Querying relevant utterances…" /> : null}
      </div>

      <form onSubmit={(event) => void onChatSubmit(event)} className={`${styles["chat-form"]} ${styles["chat-window-form"]}`}>
        <textarea
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          rows={3}
          placeholder="Query mission data..."
        />
        <button type="submit" disabled={isThinking || !chatInput.trim()}>
          {isThinking ? "Searching..." : "Search"}
        </button>
      </form>
    </DashboardPanel>
  );
};
