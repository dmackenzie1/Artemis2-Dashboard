import type {
  DashboardData,
  MissionStatsSummaryData,
  PipelineDashboardData
} from "../../api";
import { getPromptDisplay } from "../../components/dashboard/promptDisplay";
import type { DashboardPromptView, DashboardStat, DashboardViewModel } from "./types";

const extractLatestDaySummary = (summaryText: string, latestDay: string | undefined): string => {
  if (!latestDay) {
    return summaryText;
  }

  const escapedLatestDay = latestDay.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^##\\s+${escapedLatestDay}\\s*$`, "m");
  const headingMatch = headingPattern.exec(summaryText);

  if (!headingMatch) {
    return summaryText;
  }

  const sectionStart = headingMatch.index;
  const remainingText = summaryText.slice(sectionStart + headingMatch[0].length);
  const nextHeadingMatch = /^##\s+/m.exec(remainingText);
  const sectionEnd = nextHeadingMatch ? sectionStart + headingMatch[0].length + nextHeadingMatch.index : summaryText.length;

  return summaryText.slice(sectionStart, sectionEnd).trim();
};

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

const toDailyTranscriptVolume = (data: DashboardData | null): DashboardViewModel["dailyTranscriptVolume"] => {
  if (!data) {
    return [];
  }

  return data.days.map((day) => ({
    day: day.day,
    utterances: day.stats.utteranceCount,
    words: day.stats.wordCount
  }));
};

export const buildDashboardViewModel = (
  data: DashboardData | null,
  pipeline: PipelineDashboardData | null,
  statsSummary: MissionStatsSummaryData | null
): DashboardViewModel => {
  const latestDay = data?.days[data.days.length - 1]?.day;
  const missionPrompt = pipeline?.prompts.find((entry) => entry.key === "mission_summary");
  const dailyPrompt = pipeline?.prompts.find((entry) => entry.key === "daily_summary");
  const missionSummaryFallback = data?.missionSummary?.trim();
  const latestDaySummaryFallback = data?.days[data.days.length - 1]?.summary?.trim();

  const missionSummary = missionPrompt
    ? toPromptView(missionPrompt, "Building mission overview...")
    : missionSummaryFallback
      ? {
          statusLabel: "ready",
          text: missionSummaryFallback,
          lastRunAt: data?.generatedAt ?? null
        }
      : {
          statusLabel: "not ready",
          text: "Building mission overview...",
          lastRunAt: null
        };
  const dailySummaryFromPrompt = dailyPrompt ? toPromptView(dailyPrompt, "Not ready yet.") : null;

  return {
    latestDay,
    missionSummary,
    dailySummary: dailySummaryFromPrompt
      ? {
          ...dailySummaryFromPrompt,
          text: extractLatestDaySummary(dailySummaryFromPrompt.text, latestDay)
        }
      : {
          statusLabel: latestDaySummaryFallback ? "ready" : "not ready",
          text: latestDaySummaryFallback ?? "Not ready yet.",
          lastRunAt: data?.generatedAt ?? null
        },
    stats: toStats(statsSummary),
    dailyTranscriptVolume: toDailyTranscriptVolume(data)
  };
};
