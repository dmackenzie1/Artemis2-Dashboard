import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { subscribeToLiveUpdates, type LiveUpdateEvent } from "../utils/live/liveEvents";
import { clientLogger } from "../utils/logging/clientLogger";

type LiveUpdatesContextValue = {
  adminRefreshVersion: number;
  globalRefreshVersion: number;
  lastAdminRefreshAt: string | null;
  lastEvent: LiveUpdateEvent | null;
  recentEvents: LiveUpdateEvent[];
  requestAdminRefresh: () => void;
  requestGlobalRefresh: () => void;
};

const MAX_RECENT_EVENTS = 150;
const GLOBAL_REFRESH_EVENT_TYPES: ReadonlySet<LiveUpdateEvent["type"]> = new Set([
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

const LiveUpdatesContext = createContext<LiveUpdatesContextValue | null>(null);

export const LiveUpdatesProvider: FunctionComponent<PropsWithChildren> = ({ children }) => {
  const [lastEvent, setLastEvent] = useState<LiveUpdateEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<LiveUpdateEvent[]>([]);
  const [globalRefreshVersion, setGlobalRefreshVersion] = useState(0);
  const [adminRefreshVersion, setAdminRefreshVersion] = useState(0);
  const [lastAdminRefreshAt, setLastAdminRefreshAt] = useState<string | null>(null);

  const requestGlobalRefresh = useCallback((): void => {
    setGlobalRefreshVersion((previous) => previous + 1);
  }, []);

  const requestAdminRefresh = useCallback((): void => {
    setAdminRefreshVersion((previous) => previous + 1);
    setLastAdminRefreshAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    const subscription = subscribeToLiveUpdates((event) => {
      clientLogger.info("Socket live-update event received", {
        type: event.type,
        emittedAt: event.emittedAt,
        payload: event.payload ?? null
      });
      setLastEvent(event);
      setRecentEvents((previous) => [event, ...previous].slice(0, MAX_RECENT_EVENTS));
      if (GLOBAL_REFRESH_EVENT_TYPES.has(event.type)) {
        requestGlobalRefresh();
      }
    });

    return () => {
      subscription.close();
    };
  }, [requestGlobalRefresh]);

  const value = useMemo<LiveUpdatesContextValue>(
    () => ({
      adminRefreshVersion,
      globalRefreshVersion,
      lastAdminRefreshAt,
      lastEvent,
      recentEvents,
      requestAdminRefresh,
      requestGlobalRefresh
    }),
    [adminRefreshVersion, globalRefreshVersion, lastAdminRefreshAt, lastEvent, recentEvents, requestAdminRefresh, requestGlobalRefresh]
  );

  return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
};

export const useLiveUpdates = (): LiveUpdatesContextValue => {
  const contextValue = useContext(LiveUpdatesContext);
  if (!contextValue) {
    throw new Error("useLiveUpdates must be used inside LiveUpdatesProvider");
  }
  return contextValue;
};
