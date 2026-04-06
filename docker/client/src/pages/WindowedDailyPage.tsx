import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchDashboard, type DashboardData } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "../styles.module.css";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";

type WindowedDailyPageProps = {
  componentKey: string;
  navLabel: string;
  pageTitle: string;
  windowHours: 3 | 6 | 12;
};

type HourlyWindow = {
  label: string;
  summaries: Array<{ hour: string; text: string }>;
};

const extractHour = (hourKey: string): number | null => {
  const parsed = Number.parseInt(hourKey.slice(0, 2), 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 23) {
    return null;
  }

  return parsed;
};

const formatWindowLabel = (startHour: number, windowHours: number): string => {
  const endHour = Math.min(startHour + windowHours, 24);

  return `${startHour.toString().padStart(2, "0")}:00-${endHour.toString().padStart(2, "0")}:00 UTC`;
};

const toHourlyWindows = (hourly: Record<string, string>, windowHours: number): HourlyWindow[] => {
  const sortedEntries = Object.entries(hourly)
    .map(([hour, text]) => ({ hour, text, hourNumber: extractHour(hour) }))
    .filter((entry): entry is { hour: string; text: string; hourNumber: number } => entry.hourNumber !== null)
    .sort((a, b) => a.hourNumber - b.hourNumber);

  const groupedWindows = new Map<number, Array<{ hour: string; text: string }>>();

  sortedEntries.forEach((entry) => {
    const windowStart = Math.floor(entry.hourNumber / windowHours) * windowHours;
    const existingEntries = groupedWindows.get(windowStart) ?? [];
    groupedWindows.set(windowStart, [...existingEntries, { hour: entry.hour, text: entry.text }]);
  });

  return [...groupedWindows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([windowStart, summaries]) => ({
      label: formatWindowLabel(windowStart, windowHours),
      summaries
    }));
};

export const WindowedDailyPage: FC<WindowedDailyPageProps> = ({ componentKey, navLabel, pageTitle, windowHours }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const { componentId, componentUid } = useComponentIdentity(componentKey);

  useEffect(() => {
    void fetchDashboard().then((payload) => setData(payload));
  }, []);

  const dayWindows = useMemo(
    () =>
      data?.days.map((day) => ({
        day,
        windows: toHourlyWindows(day.hourly, windowHours)
      })) ?? [],
    [data?.days, windowHours]
  );

  const scrollToDay = (day: string): void => {
    const section = document.getElementById(`${componentKey}-day-${day}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.stack} data-component-id={componentId} data-component-uid={componentUid}>
      <article className={styles.panel}>
        <h2>{pageTitle}</h2>
        <p>
          This view preserves the Daily page context, but groups hourly highlights into {windowHours}-hour windows so operators can
          scan broader chunks faster.
        </p>
      </article>
      {data?.days.length ? (
        <nav className={styles["daily-day-nav"]} aria-label={`${navLabel} daily sections`}>
          {data.days.map((day) => (
            <button
              className={styles["daily-day-nav-button"]}
              key={`${componentKey}-nav-${day.day}`}
              onClick={() => scrollToDay(day.day)}
              type="button"
            >
              Day {day.day}
            </button>
          ))}
        </nav>
      ) : null}
      {dayWindows.map(({ day, windows }) => (
        <article
          className={styles.panel}
          id={`${componentKey}-day-${day.day}`}
          key={day.day}
          data-component-id={`${componentKey}-day-panel`}
          data-component-uid={`${componentUid}-${day.day}`}
        >
          <h2>{day.day}</h2>
          <div className={styles["formatted-copy"]}>{renderStructuredText(day.summary, styles["formatted-list"])}</div>
          <p>
            Utterances: {day.stats.utteranceCount} | Words: {day.stats.wordCount} | Channels: {day.stats.channelCount}
          </p>
          <h3>{windowHours}-Hour Highlights</h3>
          <div className={styles["hourly-highlight-grid"]}>
            {windows.map((window) => (
              <section className={styles["hourly-highlight-card"]} key={`${day.day}-${window.label}`}>
                <p className={styles["hourly-highlight-hour"]}>{window.label}</p>
                {window.summaries.map((summary) => (
                  <div className={styles["windowed-hour-entry"]} key={`${day.day}-${window.label}-${summary.hour}`}>
                    <p className={styles["windowed-hour-label"]}>{summary.hour}</p>
                    <div className={styles["formatted-copy"]}>{renderStructuredText(summary.text, styles["formatted-list"])}</div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </article>
      ))}
      {dayWindows.length === 0 ? <p>No data yet. Trigger ingestion on Overview page.</p> : null}
    </div>
  );
};
