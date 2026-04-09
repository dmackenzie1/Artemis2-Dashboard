import type { FC } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDashboard,
  fetchNotableMoments,
  fetchPipelineSummaries,
  type DashboardData,
  type NotableMoment,
  type NotableMomentsData
} from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./DailyPage.module.css";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";
import { clientLogger } from "../utils/logging/clientLogger";
import { subscribeToBroadcastLiveUpdates } from "../utils/live/liveEvents";

export const DailyPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pipelineSummaryByDay, setPipelineSummaryByDay] = useState<Map<string, string>>(new Map());
  const [notableMoments, setNotableMoments] = useState<NotableMomentsData | null>(null);
  const { componentId, componentUid } = useComponentIdentity("daily-page");
  const days = data?.days ?? [];

  const notableMomentsByDay = useMemo(
    () => new Map((notableMoments?.days ?? []).map((entry) => [entry.day, entry.moments])),
    [notableMoments]
  );

  const loadDailyDashboard = useCallback(async (): Promise<void> => {
    try {
      const dashboardPayload = await fetchDashboard();
      const dayEntries = dashboardPayload?.days ?? [];

      const daySummaryResponses = await Promise.all(
        dayEntries.map(async (dayEntry) => {
          const daySummaryPayload = await fetchPipelineSummaries({
            summaryType: "daily_full",
            channelGroup: "*",
            day: dayEntry.day
          });
          const canonicalDaySummary = daySummaryPayload?.summaries.find(
            (summaryEntry) => summaryEntry.summaryType === "daily_full" && summaryEntry.channelGroup === "*" && summaryEntry.day === dayEntry.day
          );
          return {
            day: dayEntry.day,
            summary: canonicalDaySummary?.summary
          };
        })
      );

      const daySummaryMap = new Map<string, string>();
      for (const daySummaryEntry of daySummaryResponses) {
        if (daySummaryEntry.summary && daySummaryEntry.summary.trim().length > 0) {
          daySummaryMap.set(daySummaryEntry.day, daySummaryEntry.summary);
        }
      }

      const notableMomentsPayload = await fetchNotableMoments();
      setData(dashboardPayload);
      setPipelineSummaryByDay(daySummaryMap);
      setNotableMoments(notableMomentsPayload);
    } catch (error) {
      clientLogger.error("Failed to load daily dashboard", { error });
    }
  }, []);

  useEffect(() => {
    void loadDailyDashboard();

    const onGlobalRefresh = (): void => {
      void loadDailyDashboard();
    };

    window.addEventListener("global-data-refresh-requested", onGlobalRefresh);
    const refreshIntervalHandle = window.setInterval(() => {
      void loadDailyDashboard();
    }, 60000);

    const liveUpdatesSubscription = subscribeToBroadcastLiveUpdates((event) => {
      if (event.type === "pipeline.run.completed" || event.type === "dashboard.cache.updated") {
        void loadDailyDashboard();
      }
    });

    return () => {
      window.removeEventListener("global-data-refresh-requested", onGlobalRefresh);
      window.clearInterval(refreshIntervalHandle);
      liveUpdatesSubscription.close();
    };
  }, [loadDailyDashboard]);

  const scrollToDay = (day: string): void => {
    const section = document.getElementById(`daily-day-${day}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={sharedStyles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      {days.length ? (
        <nav className={sharedStyles["day-shortcuts-nav"]} aria-label="Daily sections">
          {days.map((day) => (
            <button
              className={sharedStyles["day-shortcuts-nav-button"]}
              key={`daily-nav-${day.day}`}
              onClick={() => scrollToDay(day.day)}
              type="button"
            >
              Day {day.day}
            </button>
          ))}
        </nav>
      ) : null}
      {days.length ? (
        days.map((day) => {
          const dayNotableMoments: NotableMoment[] = notableMomentsByDay.get(day.day) ?? [];
          const canonicalDailySummary = pipelineSummaryByDay.get(day.day);

          return (
            <article
              className={sharedStyles.panel}
              id={`daily-day-${day.day}`}
              key={day.day}
              data-component-id="daily-day-panel"
              data-component-uid={`${componentUid}-${day.day}`}
            >
              <h2>{day.day}</h2>
              <div className={sharedStyles["formatted-copy"]}>
                {canonicalDailySummary ? (
                  renderStructuredText(canonicalDailySummary, sharedStyles["formatted-list"])
                ) : (
                  <p className={sharedStyles.subtle}>
                    Daily full summary is not ready for this day yet. Run pipeline and refresh once `daily_full` completes.
                  </p>
                )}
              </div>
              <p>
                Utterances: {day.stats.utteranceCount} | Words: {day.stats.wordCount} | Channels: {day.stats.channelCount}
              </p>


              <section className={styles["daily-notable-section"]}>
                <h3>Notable Moments</h3>
                {dayNotableMoments.length ? (
                  <div className={styles["daily-notable-grid"]}>
                    {dayNotableMoments.map((moment) => (
                      <article className={styles["daily-notable-card"]} key={`${day.day}-${moment.rank}-${moment.title}`}>
                        <p className={styles["daily-notable-rank"]}>#{moment.rank}</p>
                        <h4>{moment.title}</h4>
                        <blockquote>{moment.quote}</blockquote>
                        <p className={sharedStyles.subtle}>{moment.timestamp ?? "timestamp n/a"} • {moment.channel ?? "channel n/a"}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={sharedStyles.subtle}>Notable moments are not available yet for this day.</p>
                )}
              </section>

              <h3>Hourly Highlights</h3>
              <div className={styles["hourly-highlight-grid"]}>
                {Object.entries(day.hourly)
                  .sort(([leftHour], [rightHour]) => leftHour.localeCompare(rightHour))
                  .map(([hour, summary]) => (
                    <section className={styles["hourly-highlight-card"]} key={hour}>
                      <p className={styles["hourly-highlight-hour"]}>{hour}</p>
                      <p className={sharedStyles.subtle}>
                        Channels: {(day.stats.hourlyChannelLeads?.[hour] ?? []).join(" • ") || "No dominant channels detected"}
                      </p>
                      <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(summary, sharedStyles["formatted-list"])}</div>
                    </section>
                  ))}
              </div>
            </article>
          );
        })
      ) : (
        <p className={styles["daily-empty"]}>No data yet. Trigger ingestion on Overview page.</p>
      )}
    </div>
  );
};
