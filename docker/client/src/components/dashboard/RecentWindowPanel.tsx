import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTimeWindowSummary, type TimeWindowSummaryData } from "../../api";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";
import { clientLogger } from "../../utils/logging/clientLogger";
import sharedStyles from "../../styles/shared.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";
import styles from "./RecentWindowPanel.module.css";

const WINDOW_OPTIONS = [3, 6, 12, 24] as const;
type WindowOption = (typeof WINDOW_OPTIONS)[number];

const WINDOW_POLL_INTERVAL_MS = 5 * 60 * 1000;

const renderWindowLabel = (hours: WindowOption): string => {
  return `${hours}h`;
};

export const RecentWindowPanel: FunctionComponent = () => {
  const [activeWindowHours, setActiveWindowHours] = useState<WindowOption>(24);
  const [data, setData] = useState<TimeWindowSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadWindow = useCallback(async (hours: WindowOption): Promise<void> => {
    setIsLoading(true);
    try {
      const payload = await fetchTimeWindowSummary(hours);
      setData(payload);
      setHasError(false);
    } catch (error) {
      setHasError(true);
      clientLogger.error("Unable to fetch recent transcript review window", { error, hours });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWindow(activeWindowHours);

    const pollHandle = window.setInterval(() => {
      void loadWindow(activeWindowHours);
    }, WINDOW_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, [activeWindowHours, loadWindow]);

  const statusLabel = useMemo(() => {
    if (isLoading) {
      return "querying";
    }

    if (hasError) {
      return "error";
    }

    return "ready";
  }, [hasError, isLoading]);

  const footerText = data
    ? `Window: ${data.window.start} → ${data.window.end} | Utterances: ${data.stats.utterances.toLocaleString()} | Words: ${data.stats.words.toLocaleString()}`
    : "Database-backed rolling window summary";

  return (
    <DashboardPanel
      componentId="recent-window-panel"
      className={styles["recent-window-panel"]}
      kicker="Recent Transcript Review"
      title="What's New Right Now"
      headerAccessory={
        <div className={styles["window-switcher"]}>
          {WINDOW_OPTIONS.map((hours) => (
            <button
              key={hours}
              className={`${styles["window-button"]} ${hours === activeWindowHours ? styles["window-button-active"] : ""}`}
              type="button"
              onClick={() => {
                setActiveWindowHours(hours);
              }}
            >
              <span aria-hidden="true" className={styles["window-button-icon"]}>
                ◷
              </span>
              {renderWindowLabel(hours)}
            </button>
          ))}
          <StatusBadge label={statusLabel} />
        </div>
      }
      footer={<small className={sharedStyles.subtle}>{footerText}</small>}
    >
      {isLoading ? <PaneStateMessage message="Waiting for results…" tone="loading" /> : null}
      {!isLoading && hasError ? (
        <PaneStateMessage
          message="Unable to load the rolling transcript window. Verify DB connectivity and try again."
          tone="error"
        />
      ) : null}
      {!isLoading && !hasError && data ? (
        <div className={styles["summary-scroll-copy"]}>
          <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(data.summary, sharedStyles["formatted-list"])}</div>
        </div>
      ) : null}
    </DashboardPanel>
  );
};
