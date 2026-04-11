import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchNotableMoments, type NotableMomentsData } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./NotableMomentsPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";
import { useLiveUpdates } from "../context/LiveUpdatesContext";

export const NotableMomentsPage: FunctionComponent = () => {
  const [data, setData] = useState<NotableMomentsData | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const { globalRefreshVersion, lastEvent } = useLiveUpdates();
  const { componentId, componentUid } = useComponentIdentity("notable-moments-page");

  const loadNotableMoments = useCallback(async (): Promise<void> => {
    try {
      const payload = await fetchNotableMoments();
      setData(payload);
    } catch (error: unknown) {
      clientLogger.error("Failed to load notable moments", { error });
    }
  }, []);

  useEffect(() => {
    void loadNotableMoments();
    const refreshIntervalHandle = window.setInterval(() => {
      void loadNotableMoments();
    }, 60000);

    return () => {
      window.clearInterval(refreshIntervalHandle);
    };
  }, [loadNotableMoments]);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }
    if (
      lastEvent.type === "pipeline.run.completed" ||
      lastEvent.type === "dashboard.cache.updated" ||
      lastEvent.type === "date.updated" ||
      lastEvent.type === "day.notable-queries.updated"
    ) {
      void loadNotableMoments();
    }
  }, [lastEvent, loadNotableMoments]);

  useEffect(() => {
    if (globalRefreshVersion > 0) {
      void loadNotableMoments();
    }
  }, [globalRefreshVersion, loadNotableMoments]);

  const days = useMemo(() => {
    return data?.days ?? [];
  }, [data]);

  const scrollToDay = (day: string): void => {
    const section = document.getElementById(`notable-day-${day}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className={`${sharedStyles.stack} ${styles["notable-moments-page"]}`}
      data-component-id={componentId}
      data-component-uid={componentUid}
    >
      <section className={sharedStyles.panel}>
        <h2 className={styles["notable-moments-title"]}>Notable Moments</h2>
        <p className={sharedStyles.subtle}>
          Quote-forward daily highlights with a baseline target of {data?.targetMomentsPerDay ?? 10}, scaled up for high-signal days.
        </p>
        {(data?.droppedDayCount ?? 0) > 0 ? (
          <p className={sharedStyles.subtle}>
            Note: {data?.droppedDayCount} day output{(data?.droppedDayCount ?? 0) === 1 ? "" : "s"} could not be parsed and{" "}
            {(data?.droppedDayCount ?? 0) === 1 ? "is" : "are"} not shown. Re-running the pipeline may resolve this.
          </p>
        ) : null}
        <label className={styles["reason-toggle"]}>
          <input
            checked={showReasoning}
            onChange={(event) => setShowReasoning(event.target.checked)}
            type="checkbox"
          />
          Show analysis rationale under each quote
        </label>
      </section>

      {days.length ? (
        <nav className={sharedStyles["day-shortcuts-nav"]} aria-label="Notable moments day sections">
          {days.map((dayEntry) => (
            <button
              className={sharedStyles["day-shortcuts-nav-button"]}
              key={`notable-nav-${dayEntry.day}`}
              onClick={() => scrollToDay(dayEntry.day)}
              type="button"
            >
              Day {dayEntry.day}
            </button>
          ))}
        </nav>
      ) : null}

      {days.length === 0 ? (
        <article className={`${sharedStyles.panel} ${styles["notable-moments-day-panel"]}`}>
          <div className={styles["notable-moment-day-divider"]}>
            <h2>Waiting for Data</h2>
          </div>
          <p className={sharedStyles["pane-state-empty"]}>No notable moments yet. Run ingestion/pipeline and refresh this page.</p>
        </article>
      ) : (
        days.map((dayEntry) => (
          <article
            className={`${sharedStyles.panel} ${styles["notable-moments-day-panel"]}`}
            id={`notable-day-${dayEntry.day}`}
            key={dayEntry.day}
          >
            <div className={styles["notable-moment-day-divider"]}>
              <h2>{dayEntry.day}</h2>
            </div>
            <div className={styles["notable-moment-grid"]}>
              {dayEntry.moments.map((moment) => (
                <section
                  className={styles["notable-moment-card"]}
                  key={`${dayEntry.day}-${moment.rank}-${moment.title}`}
                >
                  <p className={styles["notable-moment-rank"]}>#{moment.rank}</p>
                  <h3>{moment.title}</h3>
                  <blockquote className={styles["notable-moment-quote"]}>{moment.quote}</blockquote>
                  {showReasoning && moment.reason.trim().length > 0 ? <p>{moment.reason}</p> : null}
                  <p className={styles["notable-moment-meta"]}>
                    {moment.timestamp ?? "timestamp n/a"} • {moment.channel ?? "channel n/a"}
                  </p>
                </section>
              ))}
            </div>
          </article>
        ))
      )}
    </div>
  );
};
