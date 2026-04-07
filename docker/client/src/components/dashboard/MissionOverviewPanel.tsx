import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDashboard, fetchPipelineDashboard, type DashboardData, type PipelineDashboardData } from "../../api";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./MissionOverviewPanel.module.css";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";
import { clientLogger } from "../../utils/logging/clientLogger";

const DASHBOARD_POLL_INTERVAL_MS = 5 * 60 * 1000;

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

export const MissionOverviewPanel: FunctionComponent<{ refreshToken?: number }> = ({ refreshToken = 0 }) => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineDashboardData | null>(null);
  const [hasError, setHasError] = useState(false);

  const loadMissionOverview = useCallback(async (): Promise<void> => {
    const [dashboardResult, pipelineResult] = await Promise.allSettled([fetchDashboard(), fetchPipelineDashboard()]);

    let encounteredFailure = false;

    if (dashboardResult.status === "fulfilled") {
      setDashboardData(dashboardResult.value);
    } else {
      encounteredFailure = true;
      clientLogger.error("Failed to fetch dashboard cache for mission overview panel", { error: dashboardResult.reason });
    }

    if (pipelineResult.status === "fulfilled") {
      setPipelineData(pipelineResult.value);
    } else {
      encounteredFailure = true;
      clientLogger.error("Failed to fetch pipeline dashboard for mission overview panel", { error: pipelineResult.reason });
    }

    setHasError(encounteredFailure);
  }, []);

  useEffect(() => {
    void loadMissionOverview();
    const pollHandle = window.setInterval(() => {
      void loadMissionOverview();
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, [loadMissionOverview, refreshToken]);

  const panelState = useMemo(() => buildMissionSummary(dashboardData, pipelineData), [dashboardData, pipelineData]);
  const hasSummary = panelState.summaryText.trim().length > 0;

  return (
    <DashboardPanel
      componentId="mission-overview-panel"
      className={styles["mission-summary-panel"]}
      kicker="Post-Mission Review"
      title="Mission Review Summary"
      headerAccessory={<StatusBadge label={hasError ? "error" : panelState.statusLabel} />}
      footer={<small className={sharedStyles.subtle}>{panelState.lastRunAt ? `Run: ${panelState.lastRunAt}` : "Awaiting first run"}</small>}
    >
      {hasError && !hasSummary ? (
        <PaneStateMessage message="Unable to refresh mission review summary right now. Retrying automatically." tone="error" />
      ) : null}
      {hasSummary ? (
        <div className={styles["summary-scroll-copy"]}>
          <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(panelState.summaryText, sharedStyles["formatted-list"])}</div>
        </div>
      ) : !hasError ? (
        <PaneStateMessage message="Waiting for review highlights…" tone="loading" />
      ) : null}
    </DashboardPanel>
  );
};
