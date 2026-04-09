import { clientLogger } from "../logging/clientLogger";

export type LiveUpdateEvent = {
  type:
    | "dashboard.cache.updated"
    | "stats.updated"
    | "time-window-summary.updated"
    | "pipeline.run.started"
    | "pipeline.run.completed"
    | "pipeline.run.failed"
    | "llm.connectivity.changed"
    | "day.ingested"
    | "day.llm.loaded"
    | "day.notable-queries.updated"
    | "date.updated"
    | "sql.file.load.started"
    | "sql.file.load.completed"
    | "sql.jobs.completed"
    | "llm.day.processing.started"
    | "llm.day.processing.completed"
    | "llm.days.completed"
    | "prompt.sent"
    | "prompt.received"
    | "prompt.error";
  emittedAt: string;
  payload?: Record<string, unknown>;
};

export const LIVE_UPDATE_DOM_EVENT_PREFIX = "live-update:";
export const LIVE_UPDATE_EVENT_TYPES: LiveUpdateEvent["type"][] = [
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
];

export const broadcastLiveUpdateToDom = (event: LiveUpdateEvent): void => {
  window.dispatchEvent(new CustomEvent<LiveUpdateEvent>(`${LIVE_UPDATE_DOM_EVENT_PREFIX}${event.type}`, { detail: event }));
};

export const subscribeToBroadcastLiveUpdates = (
  onEvent: (event: LiveUpdateEvent) => void
): { close: () => void } => {
  const listeners = LIVE_UPDATE_EVENT_TYPES.map((eventType) => {
    const handler = (event: Event): void => {
      const customEvent = event as CustomEvent<LiveUpdateEvent>;
      if (!customEvent.detail) {
        return;
      }

      onEvent(customEvent.detail);
    };

    window.addEventListener(`${LIVE_UPDATE_DOM_EVENT_PREFIX}${eventType}`, handler);
    return { eventType, handler };
  });

  return {
    close: () => {
      for (const listener of listeners) {
        window.removeEventListener(`${LIVE_UPDATE_DOM_EVENT_PREFIX}${listener.eventType}`, listener.handler);
      }
    }
  };
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

  for (const eventType of LIVE_UPDATE_EVENT_TYPES) {
    eventSource.addEventListener(eventType, onMessage as EventListener);
  }

  eventSource.addEventListener("error", () => {
    clientLogger.warn("Live-update event stream disconnected; browser will retry automatically");
  });

  return {
    close: () => {
      for (const eventType of LIVE_UPDATE_EVENT_TYPES) {
        eventSource.removeEventListener(eventType, onMessage as EventListener);
      }
      eventSource.close();
    }
  };
};
