import { clientLogger } from "../logging/clientLogger";

export const LIVE_UPDATE_EVENT_TYPES = [
  "dashboard.cache.updated",
  "stats.updated",
  "time-window-summary.updated",
  "pipeline.run.started",
  "pipeline.run.completed",
  "pipeline.run.failed",
  "llm.connectivity.changed",
  "day.ingested",
  "day.llm.loaded",
  "day.notable-queries.updated",
  "date.updated",
  "sql.file.load.started",
  "sql.file.load.completed",
  "sql.jobs.completed",
  "llm.day.processing.started",
  "llm.day.processing.completed",
  "llm.days.completed",
  "prompt.sent",
  "prompt.received",
  "prompt.error"
] as const;

export type LiveUpdateEventType = (typeof LIVE_UPDATE_EVENT_TYPES)[number];

export type LiveUpdateEvent = {
  type: LiveUpdateEventType;
  emittedAt: string;
  payload?: Record<string, unknown>;
};

export const GLOBAL_REFRESH_TRIGGER_EVENT_TYPES: ReadonlySet<LiveUpdateEventType> = new Set([
  "dashboard.cache.updated",
  "stats.updated",
  "time-window-summary.updated",
  "pipeline.run.completed",
  "date.updated",
  "day.ingested",
  "day.llm.loaded",
  "day.notable-queries.updated",
  "sql.file.load.completed",
  "sql.jobs.completed",
  "llm.day.processing.completed",
  "llm.days.completed",
  "prompt.received",
  "prompt.error"
]);

export const subscribeToLiveUpdates = (
  onEvent: (event: LiveUpdateEvent) => void,
  onReconnect?: () => void
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
  let isFirstReady = true;

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

  // The server emits a `ready` event on every new SSE connection, including
  // after the browser auto-reconnects. After the first connection we treat
  // subsequent `ready` events as reconnects and trigger a global refresh so
  // panels do not silently miss events that arrived during the gap.
  const onReady = (): void => {
    if (isFirstReady) {
      isFirstReady = false;
      return;
    }
    clientLogger.info("Live-update event stream reconnected; triggering global refresh");
    onReconnect?.();
  };

  eventSource.addEventListener("ready", onReady as EventListener);

  for (const eventType of LIVE_UPDATE_EVENT_TYPES) {
    eventSource.addEventListener(eventType, onMessage as EventListener);
  }

  eventSource.addEventListener("error", () => {
    clientLogger.warn("Live-update event stream disconnected; browser will retry automatically");
  });

  return {
    close: () => {
      eventSource.removeEventListener("ready", onReady as EventListener);
      for (const eventType of LIVE_UPDATE_EVENT_TYPES) {
        eventSource.removeEventListener(eventType, onMessage as EventListener);
      }
      eventSource.close();
    }
  };
};
