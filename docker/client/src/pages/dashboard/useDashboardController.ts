import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  chat,
  fetchDashboard,
  fetchHealth,
  fetchPipelineDashboard,
  fetchStatsSummary
} from "../../api";
import type {
  ChatMode,
  DashboardData,
  HealthData,
  MissionStatsSummaryData,
  PipelineDashboardData
} from "../../api";
import type { ChatMessage } from "../../components/dashboard/types";
import { clientLogger } from "../../utils/logging/clientLogger";
import { buildDashboardViewModel } from "./dashboardViewModel";

const starterQueries = [
  "summarize key developments from the daily page for the last 24 hours",
  "what changed in Orion ECLSS today?",
  "summarize timeline risks over the most recent flight day",
  "show mentions of comm dropouts in the timeline context"
];

const DASHBOARD_POLL_INTERVAL_MS = 5 * 60 * 1000;

export type DashboardController = {
  health: HealthData | null;
  viewModel: ReturnType<typeof buildDashboardViewModel>;
  chatInput: string;
  chatMode: ChatMode;
  isThinking: boolean;
  chatMessages: ChatMessage[];
  onChatInputChange: (value: string) => void;
  onChatModeChange: (value: ChatMode) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export const useDashboardController = (): DashboardController => {
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
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, []);

  const onChatSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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

  const viewModel = useMemo(() => {
    return buildDashboardViewModel(data, pipeline, statsSummary);
  }, [data, pipeline, statsSummary]);

  return {
    health,
    viewModel,
    chatInput,
    chatMode,
    isThinking,
    chatMessages,
    onChatInputChange: setChatInput,
    onChatModeChange: setChatMode,
    onChatSubmit
  };
};
