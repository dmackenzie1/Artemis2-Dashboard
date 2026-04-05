import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchStatsHourlyByChannel } from "../api";
import type { MissionHourlyChannelEntry } from "../api";
import { DailySummaryPanel } from "../components/dashboard/DailySummaryPanel";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { UtterancesTimelinePanel } from "../components/dashboard/UtterancesTimelinePanel";
import { clientLogger } from "../utils/logging/clientLogger";
import { useDashboardController } from "./dashboard/useDashboardController";

export const DashboardPage: FunctionComponent = () => {
  const {
    health,
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
    }, 10000);

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
        <div className="stack">
          <DashboardToolbar health={health} />
          <StatsPanel stats={viewModel.stats} />
        </div>
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
        <div className="right-rail-spacer" aria-hidden="true" />
      </section>
    </div>
  );
};
