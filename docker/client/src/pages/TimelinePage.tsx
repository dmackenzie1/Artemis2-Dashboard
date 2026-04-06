import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchNotableUtterances, fetchTimeline, type NotableUtterancesResponse, type TimelineDayEntry } from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles.shared.module.css";
import styles from "./TimelinePage.module.css";
import { renderStructuredText } from "../utils/formatting/renderStructuredText";
import { clientLogger } from "../utils/logging/clientLogger";

type TimelineDisplayItem =
  | {
      id: string;
      timestamp: number;
      type: "day-divider";
      day: string;
      missionDay: number;
    }
  | {
      id: string;
      timestamp: number;
      type: "time-marker";
      label: string;
    }
  | {
      id: string;
      timestamp: number;
      type: "summary" | "notable-event" | "utterance";
      title: string;
      timeLabel: string;
      body: string;
      tags: string[];
      meta?: string;
    };

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MAX_TOPICS_PER_DAY = 3;
const MAX_NOTABLE_UTTERANCES = 28;

const formatDateLabel = (timestamp: number): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(timestamp);

const formatDayLabel = (day: string): string => {
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(dayStart)) {
    return day;
  }

  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(dayStart);
};

const toTimestamp = (input: string): number => {
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toSummaryBody = (summary: string): string => {
  const compact = summary.replace(/\s+/g, " ").trim();
  if (compact.length <= 360) {
    return compact;
  }

  return `${compact.slice(0, 357)}...`;
};

const toReadableQuote = (quote: string): string => {
  const compact = quote.replace(/\s+/g, " ").trim();
  if (compact.length <= 240) {
    return compact;
  }

  return `${compact.slice(0, 237)}...`;
};

const buildTimelineItems = (days: TimelineDayEntry[], notable: NotableUtterancesResponse | null): TimelineDisplayItem[] => {
  if (days.length === 0) {
    return [];
  }

  const sortedDays = [...days].sort((left, right) => left.day.localeCompare(right.day));
  const contentItems: TimelineDisplayItem[] = [];

  sortedDays.forEach((dayEntry, dayIndex) => {
    const dayStart = toTimestamp(`${dayEntry.day}T00:00:00Z`);

    contentItems.push({
      id: `summary-${dayEntry.day}`,
      timestamp: dayStart + 5 * 60 * 1000,
      type: "summary",
      title: `Mission Day ${dayIndex + 1} Summary`,
      timeLabel: formatDateLabel(dayStart),
      body: toSummaryBody(dayEntry.summary),
      tags: dayEntry.topics.slice(0, MAX_TOPICS_PER_DAY),
      meta: `${dayEntry.topics.length} tracked topic${dayEntry.topics.length === 1 ? "" : "s"}`
    });

    dayEntry.topics.slice(0, MAX_TOPICS_PER_DAY).forEach((topic, topicIndex) => {
      const topicTimestamp = dayStart + (topicIndex + 1) * 80 * 60 * 1000;
      contentItems.push({
        id: `topic-${dayEntry.day}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        timestamp: topicTimestamp,
        type: "notable-event",
        title: `Notable Milestone • ${topic}`,
        timeLabel: formatDateLabel(topicTimestamp),
        body: `Mission synthesis flagged this as a high-interest milestone for ${formatDayLabel(dayEntry.day)}.`,
        tags: ["milestone", "public-facing"]
      });
    });
  });

  (notable?.utterances ?? []).slice(0, MAX_NOTABLE_UTTERANCES).forEach((entry) => {
    const timestamp = toTimestamp(entry.timestamp);
    if (!timestamp) {
      return;
    }

    contentItems.push({
      id: `utterance-${entry.id}`,
      timestamp,
      type: "utterance",
      title: `Notable Utterance • ${entry.channel}`,
      timeLabel: formatDateLabel(timestamp),
      body: `“${toReadableQuote(entry.text)}”`,
      tags: entry.reasons.slice(0, 2),
      meta: `Ref ${entry.id} • ${formatDateLabel(timestamp)} UTC • ${entry.filename} • Score ${entry.score.toFixed(2)}`
    });
  });

  const sortedContent = contentItems.sort((left, right) => left.timestamp - right.timestamp);
  const firstTimestamp = sortedContent[0]?.timestamp ?? toTimestamp(`${sortedDays[0].day}T00:00:00Z`);
  const lastTimestamp = sortedContent[sortedContent.length - 1]?.timestamp ?? toTimestamp(`${sortedDays[sortedDays.length - 1].day}T23:59:59Z`);

  const timelineItems: TimelineDisplayItem[] = [];

  sortedDays.forEach((entry, dayIndex) => {
    const timestamp = toTimestamp(`${entry.day}T00:00:00Z`);
    timelineItems.push({
      id: `divider-${entry.day}`,
      timestamp,
      type: "day-divider",
      day: entry.day,
      missionDay: dayIndex + 1
    });
  });

  const markerStart = Math.floor(firstTimestamp / SIX_HOURS_MS) * SIX_HOURS_MS;
  const markerEnd = Math.ceil(lastTimestamp / SIX_HOURS_MS) * SIX_HOURS_MS;
  for (let marker = markerStart; marker <= markerEnd; marker += SIX_HOURS_MS) {
    timelineItems.push({
      id: `marker-${marker}`,
      timestamp: marker,
      type: "time-marker",
      label: formatDateLabel(marker)
    });
  }

  timelineItems.push(...sortedContent);

  return timelineItems.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    const rank: Record<TimelineDisplayItem["type"], number> = {
      "day-divider": 0,
      "time-marker": 1,
      summary: 2,
      "notable-event": 3,
      utterance: 4
    };

    return rank[left.type] - rank[right.type];
  });
};

export const TimelinePage: FC = () => {
  const [timelineDays, setTimelineDays] = useState<TimelineDayEntry[]>([]);
  const [notableUtterances, setNotableUtterances] = useState<NotableUtterancesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightsOnly, setHighlightsOnly] = useState(false);
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const { componentId, componentUid } = useComponentIdentity("timeline-page");

  useEffect(() => {
    let active = true;

    const loadTimeline = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const [timelinePayload, notablePayload] = await Promise.all([
          fetchTimeline(),
          fetchNotableUtterances(MAX_NOTABLE_UTTERANCES, 10)
        ]);

        if (!active) {
          return;
        }

        setTimelineDays(timelinePayload);
        setNotableUtterances(notablePayload);
      } catch (loadError) {
        if (!active) {
          return;
        }

        clientLogger.error("Timeline page failed to load", { error: loadError });
        setError("Unable to load timeline telemetry right now. Please retry in a moment.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadTimeline();

    return () => {
      active = false;
    };
  }, []);

  const allItems = useMemo(() => buildTimelineItems(timelineDays, notableUtterances), [timelineDays, notableUtterances]);

  const visibleItems = useMemo(
    () =>
      allItems.filter((item) => {
        if (!highlightsOnly) {
          return true;
        }

        if (item.type === "day-divider" || item.type === "time-marker") {
          return true;
        }

        return item.type === "notable-event" || item.type === "utterance";
      }),
    [allItems, highlightsOnly]
  );

  const missionRangeLabel = useMemo(() => {
    if (timelineDays.length === 0) {
      return "No mission timeline loaded.";
    }

    const sorted = [...timelineDays].sort((left, right) => left.day.localeCompare(right.day));
    return `${formatDayLabel(sorted[0].day)} → ${formatDayLabel(sorted[sorted.length - 1].day)} • ${sorted.length} mission day${sorted.length === 1 ? "" : "s"}`;
  }, [timelineDays]);

  const scrollToLatest = (): void => {
    timelineRootRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const scrollToTop = (): void => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className={styles["timeline-page"]} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={sharedStyles["timeline-header"]}>
        <p className={sharedStyles["timeline-kicker"]}>Artemis II Mission Intelligence</p>
        <h2>Mission Timeline</h2>
        <p className={sharedStyles["timeline-subtitle"]}>Chronological mission history with day breaks, major milestones, notable communications, and transcript references.</p>
        <p className={sharedStyles["timeline-range"]}>{missionRangeLabel}</p>
      </header>

      <section className={styles["timeline-controls"]}>
        <button type="button" className={styles["timeline-control-button"]} onClick={() => setHighlightsOnly((value) => !value)}>
          {highlightsOnly ? "Show Full Timeline" : "Notable Milestones Only"}
        </button>
        <button type="button" className={styles["timeline-control-button"]} onClick={scrollToLatest}>
          Jump to Latest
        </button>
        <button type="button" className={styles["timeline-control-button"]} onClick={scrollToTop}>
          Back to Top
        </button>
      </section>

      {isLoading ? (
        <section className={styles["timeline-loading"]}>
          <div className={styles["timeline-loading-spine"]} aria-hidden="true" />
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`timeline-skeleton-${index}`} className={`${styles["timeline-skeleton-card"]} ${index % 2 === 0 ? styles["timeline-skeleton-left"] : styles["timeline-skeleton-right"]}`} />
          ))}
          <p className={styles["timeline-loading-label"]}>Loading mission chronology…</p>
        </section>
      ) : null}

      {!isLoading && error ? <p className={sharedStyles["timeline-error"]}>{error}</p> : null}

      {!isLoading && !error && visibleItems.length === 0 ? (
        <p className={styles["timeline-empty"]}>No timeline data available yet. Trigger ingestion from Overview, then return here.</p>
      ) : null}

      {!isLoading && !error && visibleItems.length > 0 ? (
        <div className={styles["timeline-canvas"]} ref={timelineRootRef}>
          <div className={styles["timeline-spine"]} aria-hidden="true" />
          {(() => {
            let eventIndex = 0;

            return visibleItems.map((item) => {
              if (item.type === "day-divider") {
                return (
                  <article key={item.id} className={styles["timeline-day-divider"]}>
                    <span className={styles["timeline-day-pill"]}>Mission Day {item.missionDay}</span>
                    <span className={styles["timeline-day-date"]}>{formatDayLabel(item.day)}</span>
                  </article>
                );
              }

              if (item.type === "time-marker") {
                return (
                  <article key={item.id} className={styles["timeline-time-marker"]}>
                    <span>{item.label}</span>
                  </article>
                );
              }

              const sideClass = eventIndex % 2 === 0 ? styles["timeline-row-left"] : styles["timeline-row-right"];
              eventIndex += 1;

              return (
                <article key={item.id} className={`${styles["timeline-event-row"]} ${sideClass}`}>
                  <div className={styles["timeline-node"]} aria-hidden="true" />
                  <section className={`${styles["timeline-event-card"]} ${styles[`timeline-event-${item.type}`]}`}>
                    <p className={styles["timeline-event-time"]}>{item.timeLabel}</p>
                    <h3>{item.title}</h3>
                    <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(item.body, sharedStyles["formatted-list"])}</div>
                    {item.meta ? <p className={styles["timeline-event-meta"]}>{item.meta}</p> : null}
                    {item.tags.length > 0 ? (
                      <div className={styles["timeline-tag-row"]}>
                        {item.tags.map((tag) => (
                          <span key={`${item.id}-${tag}`} className={styles["timeline-tag"]}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </section>
                </article>
              );
            });
          })()}
        </div>
      ) : null}
    </section>
  );
};
