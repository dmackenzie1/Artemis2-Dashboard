import { clientLogger } from "../logging/clientLogger";

export type LiveUpdateEvent = {
  type:
    | "dashboard.cache.updated"
    | "stats.updated"
    | "time-window-summary.updated"
    | "pipeline.run.started"
    | "pipeline.run.completed"
    | "pipeline.run.failed"
    | "llm.connectivity.changed";
  emittedAt: string;
  payload?: Record<string, unknown>;
};

export const subscribeToLiveUpdates = (
  onEvent: (event: LiveUpdateEvent) => void
): { close: () => void } => {
  if (typeof EventSource === "undefined") {
    clientLogger.warn("Live-update event stream unavailable in this runtime (EventSource missing)");
    return {
      close: () => {
        // no-op
      }
    };
  }

  const eventSource = new EventSource("/api/events");

  const onMessage = (rawEvent: MessageEvent<string>): void => {
    try {
      const parsed = JSON.parse(rawEvent.data) as LiveUpdateEvent;
      onEvent(parsed);
    } catch (error) {
      clientLogger.warn("Failed to parse server live-update event", {
        error,
        eventType: rawEvent.type
      });
    }
  };

  const eventTypes: LiveUpdateEvent["type"][] = [
    "dashboard.cache.updated",
    "stats.updated",
    "time-window-summary.updated",
    "pipeline.run.started",
    "pipeline.run.completed",
    "pipeline.run.failed",
    "llm.connectivity.changed"
  ];

  for (const eventType of eventTypes) {
    eventSource.addEventListener(eventType, onMessage as EventListener);
  }

  eventSource.addEventListener("error", () => {
    clientLogger.warn("Live-update event stream disconnected; browser will retry automatically");
  });

  return {
    close: () => {
      for (const eventType of eventTypes) {
        eventSource.removeEventListener(eventType, onMessage as EventListener);
      }
      eventSource.close();
    }
  };
};
