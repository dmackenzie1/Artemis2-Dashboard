import { EventEmitter } from "node:events";

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

const LIVE_UPDATE_EVENT_NAME = "live-update";

class LiveUpdateBus {
  private readonly emitter = new EventEmitter();

  publish(event: Omit<LiveUpdateEvent, "emittedAt">): void {
    this.emitter.emit(LIVE_UPDATE_EVENT_NAME, {
      ...event,
      emittedAt: new Date().toISOString()
    } satisfies LiveUpdateEvent);
  }

  subscribe(listener: (event: LiveUpdateEvent) => void): () => void {
    this.emitter.on(LIVE_UPDATE_EVENT_NAME, listener);

    return () => {
      this.emitter.off(LIVE_UPDATE_EVENT_NAME, listener);
    };
  }
}

export const liveUpdateBus = new LiveUpdateBus();
