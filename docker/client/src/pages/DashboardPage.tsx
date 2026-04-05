import type { FC, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  chat,
  fetchDashboard,
  fetchHealth,
  fetchPipelineDashboard,
  fetchStatsSummary
} from "../api";
import type {
  ChatMode,
  DashboardData,
  HealthData,
  MissionStatsSummaryData,
  PipelineDashboardData
} from "../api";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { DailySummaryPanel } from "../components/dashboard/DailySummaryPanel";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
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
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineDashboardData | null>(null);
  const [statsSummary, setStatsSummary] = useState<MissionStatsSummaryData | null>(null);
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [chatMode, setChatMode] = useState<ChatMode>("rag");
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const [dashboardPayload, healthPayload, pipelinePayload, statsSummaryPayload] = await Promise.all([
          fetchDashboard(),
          fetchHealth(),
          fetchPipelineDashboard(),
          fetchStatsSummary()
        ]);

        setData(dashboardPayload);
        setHealth(healthPayload);
        setPipeline(pipelinePayload);
        setStatsSummary(statsSummaryPayload);
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

  return (
    <div className="dashboard-layout">
      <DashboardToolbar health={health} />
      <MissionOverviewPanel prompt={missionPrompt} />
      <DailySummaryPanel prompt={dailyPrompt} latestDay={latestDay?.day} />
      <StatsPanel stats={stats} />
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
  );
};
