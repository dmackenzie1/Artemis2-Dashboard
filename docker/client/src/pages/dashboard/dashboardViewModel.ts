import type {
  DashboardData,
  MissionStatsSummaryData,
  PipelineDashboardData
} from "../../api";
import { getPromptDisplay } from "../../components/dashboard/promptDisplay";
import type { DashboardPromptView, DashboardStat, DashboardViewModel } from "./types";

const toPromptView = (
  prompt: PipelineDashboardData["prompts"][number] | undefined,
  defaultMessage: string
): DashboardPromptView => {
  const display = getPromptDisplay(prompt, defaultMessage);

  return {
    statusLabel: display.statusLabel,
    text: display.text,
    lastRunAt: prompt?.lastRunAt ?? null
  };
};

const toStats = (statsSummary: MissionStatsSummaryData | null): DashboardStat[] => {
  return [
    { label: "Min Day", value: statsSummary?.days.minDay ?? "n/a" },
    { label: "Max Day", value: statsSummary?.days.maxDay ?? "n/a" },
    { label: "Total Utterances", value: `${statsSummary?.totals.utterances ?? 0}` },
    { label: "Total Words", value: `${statsSummary?.totals.words ?? 0}` },
    { label: "Distinct Channels", value: `${statsSummary?.totals.channels ?? 0}` }
  ];
};

export const buildDashboardViewModel = (
  data: DashboardData | null,
  pipeline: PipelineDashboardData | null,
  statsSummary: MissionStatsSummaryData | null
): DashboardViewModel => {
  const latestDay = data?.days[data.days.length - 1]?.day;
  const missionPrompt = pipeline?.prompts.find((entry) => entry.key === "mission_summary");
  const dailyPrompt = pipeline?.prompts.find((entry) => entry.key === "daily_summary");

  return {
    latestDay,
    missionSummary: toPromptView(missionPrompt, "Building mission overview..."),
    dailySummary: toPromptView(dailyPrompt, "Not ready yet."),
    stats: toStats(statsSummary)
  };
};
