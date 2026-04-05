import type { FC, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { chat, fetchDashboard, fetchHealth, fetchPipelineDashboard } from "../api";
import type { ChatMode, DashboardData, HealthData, PipelineDashboardData } from "../api";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { DailySummaryPanel } from "../components/dashboard/DailySummaryPanel";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionImageryPanel } from "../components/dashboard/MissionImageryPanel";
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
  const [chatInput, setChatInput] = useState(starterQueries[0]);
  const [chatMode, setChatMode] = useState<ChatMode>("rag");
  const [isThinking, setIsThinking] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        const [dashboardPayload, healthPayload, pipelinePayload] = await Promise.all([
          fetchDashboard(),
          fetchHealth(),
          fetchPipelineDashboard()
        ]);

        setData(dashboardPayload);
        setHealth(healthPayload);
        setPipeline(pipelinePayload);
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

  const stats = useMemo(() => {
    const totals = data?.days.reduce(
      (acc, currentDay) => {
        acc.utterances += currentDay.stats.utteranceCount;
        acc.words += currentDay.stats.wordCount;
        acc.channels += currentDay.stats.channelCount;
        return acc;
      },
      { utterances: 0, words: 0, channels: 0 }
    );

    return [
      { label: "Data Days", value: `${data?.days.length ?? 0}` },
      { label: "Utterances", value: `${totals?.utterances ?? 0}` },
      { label: "Words", value: `${totals?.words ?? 0}` },
      { label: "Avg Channels/Day", value: `${Math.round((totals?.channels ?? 0) / Math.max(data?.days.length ?? 1, 1))}` }
    ];
  }, [data]);

  return (
    <div className="dashboard-layout">
      <DashboardToolbar health={health} />
      <MissionOverviewPanel prompt={missionPrompt} />
      <StatsPanel stats={stats} />
      <DailySummaryPanel prompt={dailyPrompt} latestDay={latestDay?.day} />
      <MissionImageryPanel />
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
