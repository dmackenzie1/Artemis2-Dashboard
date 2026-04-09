import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchDashboard, fetchPipelineDailySummaries, type DashboardData, type PipelineDailySummariesData } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./DailyPage.module.css";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";
import { clientLogger } from "../utils/logging/clientLogger";

export const DailyPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pipelineDailySummaries, setPipelineDailySummaries] = useState<PipelineDailySummariesData | null>(null);
  const { componentId, componentUid } = useComponentIdentity("daily-page");
  const days = data?.days ?? [];

  const pipelineSummaryByDay = useMemo(
    () => new Map((pipelineDailySummaries?.days ?? []).map((entry) => [entry.day, entry.summary])),
    [pipelineDailySummaries]
  );

  useEffect(() => {
    let isMounted = true;

    const loadDailyDashboard = async (): Promise<void> => {
      try {
        const [dashboardPayload, pipelineDailyPayload] = await Promise.all([fetchDashboard(), fetchPipelineDailySummaries()]);
        if (isMounted) {
          setData(dashboardPayload);
          setPipelineDailySummaries(pipelineDailyPayload);
        }
      } catch (error) {
        clientLogger.error("Failed to load daily dashboard", { error });
      }
    };

    void loadDailyDashboard();
    const onGlobalRefresh = (): void => {
      void loadDailyDashboard();
    };
    window.addEventListener("global-data-refresh-requested", onGlobalRefresh);

    return () => {
      isMounted = false;
      window.removeEventListener("global-data-refresh-requested", onGlobalRefresh);
    };
  }, []);

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
        days.map((day) => (
          <article
            className={sharedStyles.panel}
            id={`daily-day-${day.day}`}
            key={day.day}
            data-component-id="daily-day-panel"
            data-component-uid={`${componentUid}-${day.day}`}
          >
            <h2>{day.day}</h2>
            <div className={sharedStyles["formatted-copy"]}>
              {renderStructuredText(
                pipelineSummaryByDay.get(day.day) ?? day.summary,
                sharedStyles["formatted-list"]
              )}
            </div>
            <p>
              Utterances: {day.stats.utteranceCount} | Words: {day.stats.wordCount} | Channels: {day.stats.channelCount}
            </p>
            <h3>Hourly Highlights</h3>
            <div className={styles["hourly-highlight-grid"]}>
              {Object.entries(day.hourly).map(([hour, summary]) => (
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
        ))
      ) : (
        <p className={styles["daily-empty"]}>No data yet. Trigger ingestion on Overview page.</p>
      )}
    </div>
  );
};
