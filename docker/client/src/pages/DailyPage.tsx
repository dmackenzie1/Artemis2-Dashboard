import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchNotableMoments,
  fetchPipelineSummaries,
  fetchPipelineSummariesCatalog,
  type NotableMoment,
  type NotableMomentsData
} from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./DailyPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";
import { useLiveUpdates } from "../context/LiveUpdatesContext";

// ---------------------------------------------------------------------------
// HTML-section parser
// ---------------------------------------------------------------------------
// The pipeline daily_full summary is stored as HTML produced by the LLM
// (semantic tags: <h3>, <p>, <ul>, <li>). We parse it with DOMParser to
// extract a structured two-section view:
//   - topNarrative : first block(s) of <p> text before the first <h3>
//   - sections     : each <h3> heading paired with its following body text
// This replaces the previous dependency on the legacy analysis-cache
// `fetchDashboard()` path for hourly highlights, giving operators a single
// canonical data source without a second round-trip.
// ---------------------------------------------------------------------------

type DailySection = {
  heading: string;
  body: string;
};

type ParsedDailySummary = {
  topNarrative: string;
  sections: DailySection[];
};

const parseDailySummaryHtml = (html: string): ParsedDailySummary => {
  if (typeof window === "undefined" || !html.trim()) {
    return { topNarrative: html, sections: [] };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;

  const topParagraphs: string[] = [];
  const sections: DailySection[] = [];
  let currentHeading: string | null = null;
  let currentBodyParts: string[] = [];
  let seenFirstHeading = false;

  for (const child of Array.from(body.childNodes)) {
    const el = child as HTMLElement;
    const tag = el.tagName?.toUpperCase?.() ?? "";

    if (tag === "H3" || tag === "H4") {
      if (seenFirstHeading && currentHeading !== null) {
        sections.push({ heading: currentHeading, body: currentBodyParts.join(" ").trim() });
      }
      currentHeading = el.textContent?.trim() ?? "";
      currentBodyParts = [];
      seenFirstHeading = true;
    } else if (!seenFirstHeading) {
      const text = el.innerHTML?.trim() ?? "";
      if (text.length > 0) {
        topParagraphs.push(text);
      }
    } else if (currentHeading !== null) {
      const text = el.innerHTML?.trim() ?? "";
      if (text.length > 0) {
        currentBodyParts.push(text);
      }
    }
  }

  // Flush the last in-progress section.
  if (currentHeading !== null) {
    sections.push({ heading: currentHeading, body: currentBodyParts.join(" ").trim() });
  }

  // If DOMParser produced nothing useful (e.g. raw text without tags), fall
  // back to treating the entire string as the top narrative.
  const topNarrative =
    topParagraphs.length > 0
      ? topParagraphs.join("\n\n")
      : sections.length === 0
        ? html
        : "";

  return { topNarrative, sections };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type DayEntry = {
  day: string;
  summary: string;
};

export const DailyPage: FunctionComponent = () => {
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [notableMoments, setNotableMoments] = useState<NotableMomentsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { componentId, componentUid } = useComponentIdentity("daily-page");
  const { globalRefreshVersion, lastEvent } = useLiveUpdates();

  const notableMomentsByDay = useMemo(
    () => new Map((notableMoments?.days ?? []).map((entry) => [entry.day, entry.moments])),
    [notableMoments]
  );

  const loadDailyDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      // 1. Load the summary catalog to discover which days have daily_full
      //    pipeline artifacts — no full summary bodies, just metadata.
      const catalogPayload = await fetchPipelineSummariesCatalog();
      const availableDays = Array.from(
        new Set(
          (catalogPayload?.entries ?? [])
            .filter((entry) => entry.summaryType === "daily_full" && entry.channelGroup === "*")
            .map((entry) => entry.day)
        )
      ).sort((left, right) => left.localeCompare(right));

      // 2. Fetch each day's full summary in parallel.
      const [daySummaryResults, notableMomentsPayload] = await Promise.all([
        Promise.all(
          availableDays.map(async (day) => {
            const payload = await fetchPipelineSummaries({
              summaryType: "daily_full",
              channelGroup: "*",
              day
            });
            const canonical = payload?.summaries.find(
              (entry) => entry.summaryType === "daily_full" && entry.channelGroup === "*" && entry.day === day
            );
            return { day, summary: canonical?.summary ?? "" };
          })
        ),
        fetchNotableMoments()
      ]);

      setDayEntries(daySummaryResults.filter((entry) => entry.summary.trim().length > 0));
      setNotableMoments(notableMomentsPayload);
    } catch (error) {
      clientLogger.error("Failed to load daily dashboard", { error });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDailyDashboard();
    const refreshIntervalHandle = window.setInterval(() => {
      void loadDailyDashboard();
    }, 60_000);
    return () => {
      window.clearInterval(refreshIntervalHandle);
    };
  }, [loadDailyDashboard]);

  useEffect(() => {
    if (!lastEvent) {
      return;
    }
    if (lastEvent.type === "pipeline.run.completed" || lastEvent.type === "dashboard.cache.updated") {
      void loadDailyDashboard();
    }
  }, [lastEvent, loadDailyDashboard]);

  useEffect(() => {
    if (globalRefreshVersion > 0) {
      void loadDailyDashboard();
    }
  }, [globalRefreshVersion, loadDailyDashboard]);

  const scrollToDay = (day: string): void => {
    const section = document.getElementById(`daily-day-${day}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className={sharedStyles.stack} data-component-id={componentId} data-component-uid={componentUid}>
        <p className={sharedStyles.subtle}>Loading daily summaries…</p>
      </div>
    );
  }

  if (dayEntries.length === 0) {
    return (
      <div className={sharedStyles.stack} data-component-id={componentId} data-component-uid={componentUid}>
        <p className={sharedStyles["pane-state-empty"]}>No data yet. Run the pipeline from the Overview page, then return here.</p>
      </div>
    );
  }

  return (
    <div className={sharedStyles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      <nav className={sharedStyles["day-shortcuts-nav"]} aria-label="Daily sections">
        {dayEntries.map((entry) => (
          <button
            className={sharedStyles["day-shortcuts-nav-button"]}
            key={`daily-nav-${entry.day}`}
            onClick={() => scrollToDay(entry.day)}
            type="button"
          >
            Day {entry.day}
          </button>
        ))}
      </nav>

      {dayEntries.map((entry) => {
        const dayNotableMoments: NotableMoment[] = notableMomentsByDay.get(entry.day) ?? [];
        const parsed = parseDailySummaryHtml(entry.summary);

        return (
          <article
            className={sharedStyles.panel}
            id={`daily-day-${entry.day}`}
            key={entry.day}
            data-component-id="daily-day-panel"
            data-component-uid={`${componentUid}-${entry.day}`}
          >
            <h2>{entry.day}</h2>

            {/* Top narrative — opening mission overview paragraphs */}
            {parsed.topNarrative ? (
              <div className={`${sharedStyles["formatted-copy"]} ${styles["daily-top-narrative"]}`} dangerouslySetInnerHTML={{ __html: parsed.topNarrative }} />
            ) : null}

            {/* Hour-by-hour milestone sections extracted from pipeline HTML */}
            {parsed.sections.length > 0 ? (
              <section className={styles["daily-notable-section"]}>
                <h3>Mission Highlights</h3>
                <div className={styles["hourly-highlight-narrative"]}>
                  {parsed.sections.map((section) => (
                    <p className={sharedStyles.subtle} key={`${entry.day}-${section.heading}`}>
                      <span className={styles["hourly-highlight-hour"]}>{section.heading}</span>{" "}
                      {section.body ? <span dangerouslySetInnerHTML={{ __html: section.body }} /> : "No additional details recorded for this hour window."}
                    </p>
                  ))}
                </div>
              </section>
            ) : (
              // Fallback: render the full summary as structured text when no
              // <h3> sections were found (plain-text or markdown LLM output).
              <div className={sharedStyles["formatted-copy"]}>
                <div className={sharedStyles.subtle} dangerouslySetInnerHTML={{ __html: entry.summary.slice(0, 800) }} />
              </div>
            )}

            {/* Notable Moments grid */}
            <section className={styles["daily-notable-section"]}>
              <h3>Notable Moments</h3>
              {dayNotableMoments.length > 0 ? (
                <div className={styles["daily-notable-grid"]}>
                  {dayNotableMoments.map((moment) => (
                    <article className={styles["daily-notable-card"]} key={`${entry.day}-${moment.rank}-${moment.title}`}>
                      <p className={styles["daily-notable-rank"]}>#{moment.rank}</p>
                      <h4 dangerouslySetInnerHTML={{ __html: moment.title }} />
                      <blockquote dangerouslySetInnerHTML={{ __html: moment.quote }} />
                      <p className={sharedStyles.subtle}>
                        {moment.timestamp ?? "timestamp n/a"} • {moment.channel ?? "channel n/a"}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={sharedStyles.subtle}>Notable moments are not available yet for this day.</p>
              )}
            </section>
          </article>
        );
      })}
    </div>
  );
};
