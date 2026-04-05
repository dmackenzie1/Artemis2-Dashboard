import type { FC, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  chat,
  fetchDashboard,
  fetchPipelineDashboard,
  fetchStatsHourlyByChannel,
  fetchStatsSummary
} from "../api";
import type {
  ChatMode,
  DashboardData,
  MissionHourlyChannelEntry,
  MissionStatsSummaryData,
  PipelineDashboardData
} from "../api";
import type { FunctionComponent } from "react";
import { DailySummaryPanel } from "../components/dashboard/DailySummaryPanel";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { UtterancesTimelinePanel } from "../components/dashboard/UtterancesTimelinePanel";
import type { ChatMessage } from "../components/dashboard/types";
import { clientLogger } from "../utils/logging/clientLogger";

const starterQueries = [
  "summarize MER manager activity",
  "what changed in Orion ECLSS today?",
  "which channels discussed timeline risk?",
  "show mentions of comm dropouts"
];

export const DashboardPage: FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineDashboardData | null>(null);
  const [statsSummary, setStatsSummary] = useState<MissionStatsSummaryData | null>(null);
  const [hourlyByChannel, setHourlyByChannel] = useState<MissionHourlyChannelEntry[]>([]);
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [chatMode, setChatMode] = useState<ChatMode>("rag");
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const [dashboardPayload, pipelinePayload, statsSummaryPayload, hourlyPayload] = await Promise.all([
          fetchDashboard(),
          fetchPipelineDashboard(),
          fetchStatsSummary(),
          fetchStatsHourlyByChannel(30)
        ]);

        setData(dashboardPayload);
        setPipeline(pipelinePayload);
        setStatsSummary(statsSummaryPayload);
        setHourlyByChannel(hourlyPayload);
      } catch (error) {
        clientLogger.error("Dashboard polling failed", { error });
      }
    };

    void loadData();
    const pollHandle = window.setInterval(() => {
      void loadData();
    }, 10000);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, []);

  const onChat = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const trimmed = chatInput.trim();
    if (!trimmed || isThinking) {
      return;
    }

    setChatMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setIsThinking(true);

    try {
      const result = await chat(trimmed, chatMode);
      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: result.answer,
          strategy: result.strategy
        }
      ]);
    } catch (error) {
      clientLogger.error("Chat request failed", { error });
      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: "Unable to run chat right now. Please verify LLM connectivity and try again." }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const latestDay = data?.days[data.days.length - 1];
  const missionPrompt = pipeline?.prompts.find((entry) => entry.key === "mission_summary");
  const dailyPrompt = pipeline?.prompts.find((entry) => entry.key === "daily_summary");

  const stats = useMemo(
    () => [
      { label: "Min Day", value: statsSummary?.days.minDay ?? "n/a" },
      { label: "Max Day", value: statsSummary?.days.maxDay ?? "n/a" },
      { label: "Total Utterances", value: `${statsSummary?.totals.utterances ?? 0}` },
      { label: "Total Words", value: `${statsSummary?.totals.words ?? 0}` },
      { label: "Distinct Channels", value: `${statsSummary?.totals.channels ?? 0}` }
    ],
    [statsSummary]
  );
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
      <div className="dashboard-top-row">
        <MissionOverviewPanel prompt={missionPrompt} />
        <StatsPanel stats={stats} />
      </div>
      <div className="dashboard-mid-row">
        <DailySummaryPanel prompt={dailyPrompt} latestDay={latestDay?.day} />
      <section className="dashboard-main-grid">
        <MissionOverviewPanel
          statusLabel={viewModel.missionSummary.statusLabel}
          summaryText={viewModel.missionSummary.text}
          lastRunAt={viewModel.missionSummary.lastRunAt}
        />
        <DailySummaryPanel
          statusLabel={viewModel.dailySummary.statusLabel}
          summaryText={viewModel.dailySummary.text}
          latestDay={viewModel.latestDay}
        />
      </section>

      <aside className="dashboard-right-rail">
        <DashboardToolbar health={health} />
        <StatsPanel stats={viewModel.stats} />
      </aside>

      <section className="timeline-strip-panel">
        <MissionChatPanel
          chatInput={chatInput}
          chatMode={chatMode}
          isThinking={isThinking}
          chatMessages={chatMessages}
          onChatInputChange={setChatInput}
          onChatModeChange={setChatMode}
          onChatSubmit={onChat}
        />
      </div>
      <UtterancesTimelinePanel histogram={hourlyHistogram} />
          onChatInputChange={onChatInputChange}
          onChatModeChange={onChatModeChange}
          onChatSubmit={onChatSubmit}
        />
      </section>
    </div>
  );
};
