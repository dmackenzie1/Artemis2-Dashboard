import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchStatsHourlyByChannel } from "../api";
import type { MissionHourlyChannelEntry } from "../api";
import { DailySummaryPanel } from "../components/dashboard/DailySummaryPanel";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { UtterancesTimelinePanel } from "../components/dashboard/UtterancesTimelinePanel";
import { clientLogger } from "../utils/logging/clientLogger";
import { useDashboardController } from "./dashboard/useDashboardController";

const HOURLY_STATS_POLL_INTERVAL_MS = 5 * 60 * 1000;

export const DashboardPage: FunctionComponent = () => {
  const {
    viewModel,
    chatInput,
    chatMode,
    isThinking,
    chatMessages,
    onChatInputChange,
    onChatModeChange,
    onChatSubmit
  } = useDashboardController();
  const [hourlyByChannel, setHourlyByChannel] = useState<MissionHourlyChannelEntry[]>([]);

  useEffect(() => {
    const loadHourly = async (): Promise<void> => {
      try {
        const hourlyPayload = await fetchStatsHourlyByChannel(30);
        setHourlyByChannel(hourlyPayload);
      } catch (error) {
        clientLogger.error("Unable to fetch hourly mission activity", { error });
      }
    };

    void loadHourly();
    const pollHandle = window.setInterval(() => {
      void loadHourly();
    }, HOURLY_STATS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, []);

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
    <div className="dashboard-layout">
      <section className="dashboard-top-row">
        <MissionOverviewPanel
          statusLabel={viewModel.missionSummary.statusLabel}
          summaryText={viewModel.missionSummary.text}
          lastRunAt={viewModel.missionSummary.lastRunAt}
        />
        <StatsPanel stats={viewModel.stats} />
      </section>

      <section className="dashboard-mid-row">
        <DailySummaryPanel
          statusLabel={viewModel.dailySummary.statusLabel}
          summaryText={viewModel.dailySummary.text}
          latestDay={viewModel.latestDay}
        />
        <MissionChatPanel
          chatInput={chatInput}
          chatMode={chatMode}
          isThinking={isThinking}
          chatMessages={chatMessages}
          onChatInputChange={onChatInputChange}
          onChatModeChange={onChatModeChange}
          onChatSubmit={onChatSubmit}
        />
      </section>

      <section className="dashboard-bottom-row">
        <UtterancesTimelinePanel histogram={hourlyHistogram} />
      </section>
    </div>
  );
};
