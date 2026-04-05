import type { FunctionComponent, FormEvent } from "react";
import type { ChatMode } from "../../api";
import type { ChatMessage } from "./types";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { LoadingIndicator } from "./primitives/LoadingIndicator";
import { StatusBadge } from "./primitives/StatusBadge";

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
  const modePicker = (
    <label className="chat-mode-picker" htmlFor="chat-mode">
      Context Mode
      <select id="chat-mode" value={chatMode} onChange={(event) => onChatModeChange(event.target.value as ChatMode)}>
        <option value="rag">Targeted Retrieval</option>
        <option value="all">Broad Sweep</option>
      </select>
    </label>
  );

  return (
    <DashboardPanel
      className="mission-chat-panel"
      kicker="Intelligence Interface"
      title="Mission Query Console"
      headerAccessory={modePicker}
      footer={<StatusBadge label={isThinking ? "querying" : "ready"} />}
    >
      <div className="chat-window" role="log" aria-live="polite">
        {chatMessages.length === 0 ? (
          <p className="chat-empty">Ask about anomalies, channels, timeline changes, or mission readiness.</p>
        ) : null}
        {chatMessages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`chat-bubble ${message.role === "user" ? "chat-user" : "chat-assistant"}`}>
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

      <form onSubmit={(event) => void onChatSubmit(event)} className="chat-form chat-window-form">
        <textarea
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          rows={3}
          placeholder="Query mission data..."
        />
        <button type="submit" disabled={isThinking || !chatInput.trim()}>
          {isThinking ? "Running..." : "Run Query"}
        </button>
      </form>
    </DashboardPanel>
  );
};
