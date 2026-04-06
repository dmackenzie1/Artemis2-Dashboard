import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStatsHourlyByChannel } from "../api";
import type { MissionHourlyChannelEntry } from "../api";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { RecentWindowPanel } from "../components/dashboard/RecentWindowPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { UtterancesTimelinePanel } from "../components/dashboard/UtterancesTimelinePanel";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "./DashboardPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";
import { useDashboardController } from "./dashboard/useDashboardController";
import { useLocation } from "react-router-dom";

const HOURLY_STATS_POLL_INTERVAL_MS = 5 * 60 * 1000;

export const DashboardPage: FunctionComponent = () => {
  const { componentId, componentUid } = useComponentIdentity("dashboard-page");
  const location = useLocation();
  const adminMode = useMemo(() => {
    const adminQueryValue = new URLSearchParams(location.search).get("admin");
    return adminQueryValue === "true";
  }, [location.search]);
  const {
    viewModel,
    chatInput,
    isThinking,
    chatMessages,
    hasLoadFailure,
    onChatInputChange,
    onChatSubmit,
    refreshDashboard
  } = useDashboardController();
  const [hourlyByChannel, setHourlyByChannel] = useState<MissionHourlyChannelEntry[]>([]);
  const [hourlyLoadFailed, setHourlyLoadFailed] = useState(false);

  const loadHourly = useCallback(async (): Promise<void> => {
    try {
      const hourlyPayload = await fetchStatsHourlyByChannel(30);
      setHourlyByChannel(hourlyPayload);
      setHourlyLoadFailed(false);
    } catch (error) {
      setHourlyLoadFailed(true);
      clientLogger.error("Unable to fetch hourly mission activity", { error });
    }
  }, []);

  useEffect(() => {
    void loadHourly();
    const pollHandle = window.setInterval(() => {
      void loadHourly();
    }, HOURLY_STATS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, [loadHourly]);

  useEffect(() => {
    const handleAdminRefresh = (): void => {
      void refreshDashboard();
      void loadHourly();
    };

    window.addEventListener("dashboard-admin-refresh-requested", handleAdminRefresh);
    return () => {
      window.removeEventListener("dashboard-admin-refresh-requested", handleAdminRefresh);
    };
  }, [loadHourly, refreshDashboard]);

  const hourlyHistogram = useMemo(() => {
    if (hourlyByChannel.length === 0) {
      return [];
    }

    const totalsByHour = new Map<string, number>();
    for (const entry of hourlyByChannel) {
      const current = totalsByHour.get(entry.hour) ?? 0;
      totalsByHour.set(entry.hour, current + entry.utterances);
    }

    return Array.from(totalsByHour.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([hour, utterances]) => ({ hour, channel: "all", utterances }));
  }, [hourlyByChannel]);

  return (
    <div className={styles["dashboard-layout"]} data-component-id={componentId} data-component-uid={componentUid}>
      <section className={styles["dashboard-top-row"]} data-component-id="dashboard-top-row" data-component-uid={`${componentUid}-top`}>
        <RecentWindowPanel />
        <StatsPanel stats={viewModel.stats} timelineHours={hourlyHistogram.length} dailyTranscriptVolume={viewModel.dailyTranscriptVolume} />
      </section>

      <section className={styles["dashboard-mid-row"]} data-component-id="dashboard-mid-row" data-component-uid={`${componentUid}-mid`}>
        <MissionOverviewPanel
          statusLabel={viewModel.missionSummary.statusLabel}
          summaryText={viewModel.missionSummary.text}
          lastRunAt={viewModel.missionSummary.lastRunAt}
        />
        <MissionChatPanel
          chatInput={chatInput}
          isThinking={isThinking}
          chatMessages={chatMessages}
          onChatInputChange={onChatInputChange}
          onChatSubmit={onChatSubmit}
        />
      </section>

      <section className={styles["dashboard-bottom-row"]} data-component-id="dashboard-bottom-row" data-component-uid={`${componentUid}-bottom`}>
        <UtterancesTimelinePanel histogram={hourlyHistogram} />
      </section>
      {adminMode && (hasLoadFailure || hourlyLoadFailed) ? (
        <div className={styles["dashboard-admin-hint"]}>
          Widget query failed. Automatic retry runs every 5 minutes. Use the top-right admin refresh to retry immediately.
        </div>
      ) : null}
    </div>
  );
};
