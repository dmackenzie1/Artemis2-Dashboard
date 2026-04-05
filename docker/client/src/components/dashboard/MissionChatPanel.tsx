import type { FC, FormEvent } from "react";
import type { ChatMode } from "../../api";
import type { ChatMessage } from "./types";

type MissionChatPanelProps = {
  chatInput: string;
  chatMode: ChatMode;
  isThinking: boolean;
  chatMessages: ChatMessage[];
  onChatInputChange: (value: string) => void;
  onChatModeChange: (value: ChatMode) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const MissionChatPanel: FC<MissionChatPanelProps> = ({
  chatInput,
  chatMode,
  isThinking,
  chatMessages,
  onChatInputChange,
  onChatModeChange,
  onChatSubmit
}) => {
  return (
    <section className="panel space-panel mission-chat-panel">
      <div className="chat-panel-header">
        <div>
          <p className="panel-kicker">Intelligence Interface</p>
          <h2>Mission Query Console</h2>
        </div>
        <label className="chat-mode-picker" htmlFor="chat-mode">
          Context Mode
          <select id="chat-mode" value={chatMode} onChange={(event) => onChatModeChange(event.target.value as ChatMode)}>
            <option value="rag">Targeted Retrieval</option>
            <option value="all">Broad Sweep</option>
          </select>
        </label>
      </div>

      <p className="chat-helper-text">Targeted mode isolates relevant evidence. Broad sweep sends a wider transcript slice for exploratory questions.</p>

      <div className="chat-window" role="log" aria-live="polite">
        {chatMessages.length === 0 ? <p className="chat-empty">Ask about anomalies, channels, timeline changes, or mission readiness.</p> : null}
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
        {isThinking ? <article className="chat-bubble chat-assistant">Analyzing mission context…</article> : null}
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
    </section>
  );
};
