export type DashboardStat = {
  label: string;
  value: string;
};

export type DashboardPromptView = {
  statusLabel: string;
  text: string;
  lastRunAt: string | null;
};

export type DashboardViewModel = {
  latestDay?: string;
  missionSummary: DashboardPromptView;
  dailySummary: DashboardPromptView;
  stats: DashboardStat[];
  dailyTranscriptVolume: Array<{
    day: string;
    utterances: number;
    words: number;
  }>;
};
