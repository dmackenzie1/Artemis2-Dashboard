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
    <section className="panel space-panel span2">
      <div className="chat-panel-header">
        <h2>Mission Chat</h2>
        <label className="chat-mode-picker" htmlFor="chat-mode">
          Context Mode
          <select id="chat-mode" value={chatMode} onChange={(event) => onChatModeChange(event.target.value as ChatMode)}>
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
        {isThinking ? <article className="chat-bubble chat-assistant">Thinking...</article> : null}
      </div>

      <form onSubmit={(event) => void onChatSubmit(event)} className="chat-form chat-window-form">
        <textarea
          value={chatInput}
          onChange={(event) => onChatInputChange(event.target.value)}
          rows={3}
          placeholder="Type your mission question..."
        />
        <button type="submit" disabled={isThinking || !chatInput.trim()}>
          {isThinking ? "Thinking..." : "Send"}
        </button>
      </form>
    </section>
  );
};
