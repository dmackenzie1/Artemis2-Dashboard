import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDashboard,
  fetchPipelineDashboard,
  fetchTimeWindowSummary,
  type DashboardData,
  type PipelineDashboardData,
  type TimeWindowSummaryData
} from "../../api";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";
import { clientLogger } from "../../utils/logging/clientLogger";
import sharedStyles from "../../styles/shared.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";
import styles from "./RecentWindowPanel.module.css";

const WINDOW_OPTIONS = [3, 6, 12, "complete"] as const;
type WindowOption = (typeof WINDOW_OPTIONS)[number];

const WINDOW_POLL_INTERVAL_MS = 30 * 60 * 1000;

const renderWindowLabel = (value: WindowOption): string => {
  if (value === "complete") {
    return "Complete";
  }
  return `${value}h`;
};

const buildMissionSummary = (dashboardData: DashboardData | null, pipelineData: PipelineDashboardData | null): {
  statusLabel: string;
  summaryText: string;
  lastRunAt: string | null;
} => {
  const missionPrompt = pipelineData?.prompts.find((entry) => entry.key === "mission_summary");
  const fallbackSummary = dashboardData?.missionSummary?.trim();

  if (missionPrompt) {
    return {
      statusLabel: missionPrompt.status === "success" ? "ready" : missionPrompt.status === "running" ? "running" : "not ready",
      summaryText: missionPrompt.output?.trim() || "Building mission overview...",
      lastRunAt: missionPrompt.lastRunAt
    };
  }

  if (fallbackSummary) {
    return {
      statusLabel: "ready",
      summaryText: fallbackSummary,
      lastRunAt: dashboardData?.generatedAt ?? null
    };
  }

  return {
    statusLabel: "not ready",
    summaryText: "",
    lastRunAt: null
  };
};

export const RecentWindowPanel: FunctionComponent<{ refreshToken?: number }> = ({ refreshToken = 0 }) => {
  const [activeWindowHours, setActiveWindowHours] = useState<WindowOption>(3);
  const [data, setData] = useState<TimeWindowSummaryData | null>(null);
  const [missionData, setMissionData] = useState<{ summaryText: string; lastRunAt: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadWindow = useCallback(async (windowOption: WindowOption): Promise<void> => {
    setIsLoading(true);
    setHasError(false);

    try {
      if (windowOption === "complete") {
        const [dashboardResult, pipelineResult] = await Promise.allSettled([fetchDashboard(), fetchPipelineDashboard()]);
        const dashboardData = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
        const pipelineData = pipelineResult.status === "fulfilled" ? pipelineResult.value : null;
        if (dashboardResult.status === "rejected") {
          clientLogger.error("Failed to load dashboard cache for complete mission view", { error: dashboardResult.reason });
        }
        if (pipelineResult.status === "rejected") {
          clientLogger.error("Failed to load pipeline dashboard for complete mission view", { error: pipelineResult.reason });
        }

        const missionSummary = buildMissionSummary(dashboardData, pipelineData);
        setMissionData({ summaryText: missionSummary.summaryText, lastRunAt: missionSummary.lastRunAt });
        setData(null);
        if (missionSummary.summaryText.trim().length === 0) {
          setHasError(true);
        }
      } else {
        const payload = await fetchTimeWindowSummary(windowOption);
        setData(payload);
        setMissionData(null);
      }
    } catch (error) {
      setHasError(true);
      clientLogger.error("Unable to fetch transcript review content", { error, windowOption });
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
  }, [activeWindowHours, loadWindow, refreshToken]);

  const statusLabel = useMemo(() => {
    if (isLoading) {
      return "querying";
    }

    if (hasError) {
      return "error";
    }

    return "ready";
  }, [hasError, isLoading]);

  const footerText = useMemo(() => {
    if (activeWindowHours === "complete") {
      return missionData?.lastRunAt ? `Mission synthesis run: ${missionData.lastRunAt}` : "Mission synthesis from persisted daily summaries";
    }

    if (data) {
      return `Window: ${data.window.start} → ${data.window.end} | Utterances: ${data.stats.utterances.toLocaleString()} | Words: ${
        data.stats.words
      .toLocaleString()} | Source: database`;
    }

    return "Database-backed rolling window summary";
  }, [activeWindowHours, data, missionData?.lastRunAt]);

  const textBody = activeWindowHours === "complete" ? missionData?.summaryText ?? "" : data?.summary ?? "";

  return (
    <DashboardPanel
      componentId="recent-window-panel"
      className={styles["recent-window-panel"]}
      kicker="Recent Transcript Review"
      title="Mission Text Workspace"
      headerAccessory={
        <div className={styles["window-switcher"]}>
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              className={`${styles["window-button"]} ${option === activeWindowHours ? styles["window-button-active"] : ""}`}
              type="button"
              onClick={() => {
                setActiveWindowHours(option);
              }}
            >
              <span aria-hidden="true" className={styles["window-button-icon"]}>
                ◷
              </span>
              {renderWindowLabel(option)}
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
          message="Unable to load transcript review content. Verify DB connectivity and prompt pipeline status, then retry."
          tone="error"
        />
      ) : null}
      {!isLoading && !hasError && textBody.trim().length > 0 ? (
        <div className={sharedStyles["panel-scroll-copy"]}>
          <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(textBody, sharedStyles["formatted-list"])}</div>
        </div>
      ) : null}
    </DashboardPanel>
  );
};
