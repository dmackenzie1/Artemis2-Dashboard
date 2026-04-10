import { EventEmitter } from "node:events";
import { serverLogger } from "../utils/logging/serverLogger.js";

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

const LIVE_UPDATE_EVENT_NAME = "live-update";

class LiveUpdateBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow up to 200 concurrent SSE subscribers without triggering Node.js
    // MaxListenersExceededWarning (default cap is 10).
    this.emitter.setMaxListeners(200);
  }

  publish(event: Omit<LiveUpdateEvent, "emittedAt">): void {
    const hydratedEvent = {
      ...event,
      emittedAt: new Date().toISOString()
    } satisfies LiveUpdateEvent;
    this.emitter.emit(LIVE_UPDATE_EVENT_NAME, hydratedEvent);
    serverLogger.info("Published live update event", {
      type: hydratedEvent.type,
      emittedAt: hydratedEvent.emittedAt,
      payload: hydratedEvent.payload ?? null
    });
  }

  subscribe(listener: (event: LiveUpdateEvent) => void): () => void {
    this.emitter.on(LIVE_UPDATE_EVENT_NAME, listener);

    return () => {
      this.emitter.off(LIVE_UPDATE_EVENT_NAME, listener);
    };
  }
}

export const liveUpdateBus = new LiveUpdateBus();
