export type TranscriptUtterance = {
  id: string;
  timestamp: string;
  day: string;
  hour: string;
  channel: string;
  durationSec: number;
  language: string;
  translated: string;
  text: string;
  filename: string;
  sourceFile: string;
};

export type Topic = {
  title: string;
  description: string;
  channels: string[];
  mentionTimestamps: string[];
};

export type DayInsights = {
  day: string;
  summary: string;
  hourly: Record<string, string>;
  topics: Topic[];
  stats: {
    utteranceCount: number;
    wordCount: number;
    channelCount: number;
  };
};

export type DashboardCache = {
  generatedAt: string;
  missionSummary: string;
  recentChanges: string;
  days: DayInsights[];
};
