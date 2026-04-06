import { clientLogger } from "./utils/logging/clientLogger";

export type DashboardData = {
  generatedAt: string;
  missionSummary: string;
  recentChanges: string;
  days: Array<{
    day: string;
    summary: string;
    hourly: Record<string, string>;
    topics: Array<{ title: string; description: string }>;
    stats: { utteranceCount: number; wordCount: number; channelCount: number; hourlyUtterances: Record<string, number> };
  }>;
};

export type PipelineDashboardData = {
  generatedAt: string;
  prompts: Array<{
    id: number;
    key: string;
    componentId: string;
    fileName: string;
    promptUpdatedAt: string;
    lastRunAt: string | null;
    status: "running" | "success" | "failed" | "never";
    cacheHit: boolean;
    submittedPreview: string | null;
    outputPreview: string | null;
    submittedText: string | null;
    output: string | null;
    errorMessage: string | null;
  }>;
};

export type PipelineStatsData = {
  generatedAt: string;
  range: {
    minTimestamp: string | null;
    maxTimestamp: string | null;
  };
  totals: {
    dataDays: number;
    utterances: number;
    lines: number;
    words: number;
  };
  utterancesPerHour: Array<{
    hour: string;
    utterances: number;
  }>;
};

export type MissionStatsSummaryData = {
  generatedAt: string;
  days: {
    minDay: string | null;
    maxDay: string | null;
  };
  totals: {
    utterances: number;
    words: number;
    channels: number;
  };
};

export type MissionHourlyChannelEntry = {
  hour: string;
  channel: string;
  utterances: number;
};


export type TimelineDayEntry = {
  day: string;
  summary: string;
  topics: string[];
};

export type NotableUtteranceEntry = {
  id: string;
  timestamp: string;
  day: string;
  channel: string;
  filename: string;
  text: string;
  score: number;
  reasons: string[];
};

export type NotableUtterancesResponse = {
  totalUtterances: number;
  limit: number;
  days: number;
  utterances: NotableUtteranceEntry[];
};

export type HealthData = {
  ok: boolean;
  llm: {
    connected: boolean;
    model: string | null;
    baseUrl: string | null;
    checkedAt: string;
    error: string | null;
  };
};

export type ChatResponse = {
  answer: string;
  evidence: Array<{ timestamp: string; channel: string; text: string; filename: string }>;
  strategy: {
    mode: "multi-day" | "rag" | "all";
    totalUtterances: number;
    contextUtterances: number;
    daysQueried: number;
  };
};

export type ChatMode = "rag" | "all";


export type SystemLogEntry = {
  id: string;
  category: "prompt-submission" | "prompt-outgoing" | "prompt-incoming";
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type SystemLogListResponse = {
  generatedAt: string;
  logs: SystemLogEntry[];
};

export type SystemLogFileResponse = {
  entry: SystemLogEntry;
  content: string;
};

export type TriggerPipelineRunResponse = {
  accepted: boolean;
  status: "already-running" | "started";
}

export type NotableMoment = {
  rank: number;
  title: string;
  quote: string;
  reason: string;
  timestamp: string | null;
  channel: string | null;
  sourcePath: string;
};

export type NotableMomentsDay = {
  day: string;
  moments: NotableMoment[];
};

export type NotableMomentsData = {
  generatedAt: string;
  status: "running" | "success" | "failed" | "never";
  targetMomentsPerDay?: number;
  days: string[];
};

const base = "/api";

export const fetchDashboard = async (): Promise<DashboardData | null> => {
  const response = await fetch(`${base}/dashboard`);
  if (!response.ok) {
    throw new Error("Unable to load dashboard");
  }

  return (await response.json()) as DashboardData | null;
};

export const triggerIngest = async (): Promise<DashboardData> => {
  clientLogger.info("Requesting ingest run from client");
  const response = await fetch(`${base}/ingest`, { method: "POST" });
  if (!response.ok) {
    clientLogger.error("Ingest request failed", { status: response.status });
    throw new Error("Unable to ingest data");
  }

  const payload = (await response.json()) as DashboardData;
  clientLogger.info("Ingest request completed", { generatedAt: payload.generatedAt, totalDays: payload.days.length });

  return payload;
};

export const fetchPipelineDashboard = async (): Promise<PipelineDashboardData | null> => {
  const response = await fetch(`${base}/pipeline/dashboard`);
  if (!response.ok) {
    clientLogger.warn("Pipeline dashboard unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as PipelineDashboardData;
};

export const fetchPipelineStats = async (): Promise<PipelineStatsData | null> => {
  const response = await fetch(`${base}/pipeline/stats`);
  if (!response.ok) {
    clientLogger.warn("Pipeline stats unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as PipelineStatsData;
};

export const triggerPipelineRun = async (): Promise<TriggerPipelineRunResponse> => {
  const response = await fetch(`${base}/pipeline/run`, { method: "POST" });
  if (!response.ok) {
    clientLogger.error("Pipeline run request failed", { status: response.status });
    throw new Error("Unable to trigger pipeline run");
  }

  return (await response.json()) as TriggerPipelineRunResponse;
};

export const fetchStatsSummary = async (): Promise<MissionStatsSummaryData | null> => {
  const response = await fetch(`${base}/stats/summary`);
  if (!response.ok) {
    clientLogger.warn("Stats summary unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as MissionStatsSummaryData;
};

export const fetchStatsHourlyByChannel = async (days = 7): Promise<MissionHourlyChannelEntry[]> => {
  const response = await fetch(`${base}/stats/channels/hourly?days=${days}`);
  if (!response.ok) {
    clientLogger.warn("Hourly channel stats unavailable", { status: response.status, days });
    return [];
  }

  return (await response.json()) as MissionHourlyChannelEntry[];
};



export const fetchTimeline = async (): Promise<TimelineDayEntry[]> => {
  const response = await fetch(`${base}/timeline`);
  if (!response.ok) {
    throw new Error("Unable to load timeline");
  }

  return (await response.json()) as TimelineDayEntry[];
};

export const fetchNotableUtterances = async (limit = 10, days = 7): Promise<NotableUtterancesResponse | null> => {
  const response = await fetch(`${base}/notable-utterances?limit=${limit}&days=${days}`);
  if (!response.ok) {
    clientLogger.warn("Notable utterances unavailable", { status: response.status, limit, days });
    return null;
  }

  return (await response.json()) as NotableUtterancesResponse;
};

export const fetchHealth = async (): Promise<HealthData> => {
  const response = await fetch(`${base}/health`);
  if (!response.ok) {
    throw new Error("Unable to load health status");
  }

  return (await response.json()) as HealthData;
};

export const fetchNotableMoments = async (): Promise<NotableMomentsData | null> => {
  const response = await fetch(`${base}/pipeline/notable-moments`);
  if (!response.ok) {
    clientLogger.warn("Notable moments unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as NotableMomentsData;
};



export const fetchSystemLogs = async (): Promise<SystemLogListResponse> => {
  const response = await fetch(`${base}/system-logs`);
  if (!response.ok) {
    throw new Error("Unable to load system logs");
  }

  return (await response.json()) as SystemLogListResponse;
};

export const fetchSystemLogFile = async (id: string): Promise<SystemLogFileResponse> => {
  const response = await fetch(`${base}/system-logs/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error("Unable to load system log file");
  }

  return (await response.json()) as SystemLogFileResponse;
};

export const chat = async (query: string): Promise<ChatResponse> => {
  const response = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, mode })
  });

  if (!response.ok) {
    throw new Error("Unable to run chat");
  }

  return (await response.json()) as ChatResponse;
};
