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
    stats: {
      utteranceCount: number;
      wordCount: number;
      channelCount: number;
      hourlyUtterances: Record<string, number>;
      hourlyChannelLeads?: Record<string, string[]>;
    };
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

export type PromptMatrixStateData = {
  generatedAt: string;
  latestIngestAt: string | null;
  days: string[];
  prompts: Array<{
    key: string;
    componentId: string;
    cells: Array<{
      day: string;
      state: "none" | "sent" | "received" | "error";
      sentAt: string | null;
      receivedAt: string | null;
      responseDay: string | null;
      executionId: number | null;
      errorMessage: string | null;
    }>;
  }>;
};

export type PipelineSummariesData = {
  generatedAt: string;
  summaries: Array<{
    id: number;
    summaryType: string;
    day: string;
    periodStart: string;
    periodEnd: string;
    channelGroup: string;
    summary: string;
    generatedAt: string;
    updatedAt: string;
    wordCount: number;
    utteranceCount: number;
    sourceDocumentCount: number;
  }>;
};

export type PipelineSummariesCatalogData = {
  generatedAt: string;
  entries: Array<{
    summaryType: string;
    day: string;
    channelGroup: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    updatedAt: string;
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

export type MissionDailyVolumeData = {
  generatedAt: string;
  days: Array<{
    day: string;
    utterances: number;
    words: number;
    channels: number;
  }>;
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


export type TimeWindowSummaryData = {
  generatedAt: string;
  window: {
    hours: number;
    start: string;
    end: string;
  };
  stats: {
    utterances: number;
    words: number;
    channels: number;
  };
  summary: string;
  highlights: Array<{
    hour: string;
    summary: string;
  }>;
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

export type RankedEvidence = {
  timestamp: string;
  day: string;
  channel: string;
  text: string;
  filename: string;
  source: string;
  score: number;
};

export type UtteranceSearchResponse = {
  query: string;
  queryTokens: string[];
  totalUtterances: number;
  resultCount: number;
  utterances: RankedEvidence[];
};

export type ChatResponse = {
  answer: string;
  evidence: RankedEvidence[];
  strategy: {
    mode: "rag_chat" | "llm_chat";
    totalUtterances: number;
    contextUtterances: number;
    daysQueried: number;
  };
};

export type ChatMode = "rag_chat" | "llm_chat";

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

export type TriggerIngestResponse = DashboardData;

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
  days: NotableMomentsDay[];
  parsedDayCount?: number;
  droppedDayCount?: number;
};

const base = "/api";
const hourlyStatsClientCacheTtlMs = 60 * 1000;
const hourlyStatsResponseCache = new Map<number, { fetchedAtMs: number; payload: MissionHourlyChannelEntry[] }>();
const hourlyStatsInFlight = new Map<number, Promise<MissionHourlyChannelEntry[]>>();

export const fetchDashboard = async (): Promise<DashboardData | null> => {
  const response = await fetch(`${base}/dashboard`);
  if (!response.ok) {
    throw new Error("Unable to load dashboard");
  }

  return (await response.json()) as DashboardData | null;
};


export const fetchPipelineDashboard = async (): Promise<PipelineDashboardData | null> => {
  const response = await fetch(`${base}/pipeline/dashboard`);
  if (!response.ok) {
    clientLogger.warn("Pipeline dashboard unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as PipelineDashboardData;
};

export const fetchPromptMatrixState = async (days = 11): Promise<PromptMatrixStateData> => {
  const safeDays = Math.max(1, Math.min(Math.trunc(days), 20));
  const response = await fetch(`${base}/pipeline/prompt-matrix-state?days=${safeDays}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load prompt matrix state");
  }

  return (await response.json()) as PromptMatrixStateData;
};

export const fetchPipelineSummaries = async (options?: {
  summaryType?: string;
  day?: string;
  channelGroup?: string;
}): Promise<PipelineSummariesData | null> => {
  const query = new URLSearchParams();
  if (options?.summaryType) {
    query.set("summaryType", options.summaryType);
  }
  if (options?.day) {
    query.set("day", options.day);
  }
  if (options?.channelGroup) {
    query.set("channelGroup", options.channelGroup);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await fetch(`${base}/pipeline/summaries${suffix}`);
  if (!response.ok) {
    clientLogger.warn("Pipeline summaries unavailable", { status: response.status, options });
    return null;
  }

  return (await response.json()) as PipelineSummariesData;
};

export const fetchPipelineSummariesCatalog = async (): Promise<PipelineSummariesCatalogData | null> => {
  const response = await fetch(`${base}/pipeline/summaries/catalog`);
  if (!response.ok) {
    clientLogger.warn("Pipeline summaries catalog unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as PipelineSummariesCatalogData;
};

export const triggerPipelineRun = async (): Promise<TriggerPipelineRunResponse> => {
  const response = await fetch(`${base}/pipeline/run`, { method: "POST" });
  if (!response.ok) {
    clientLogger.error("Pipeline run request failed", { status: response.status });
    throw new Error("Unable to trigger pipeline run");
  }

  return (await response.json()) as TriggerPipelineRunResponse;
};

export const triggerIngest = async (): Promise<TriggerIngestResponse> => {
  const response = await fetch(`${base}/ingest`, { method: "POST", cache: "no-store" });
  if (!response.ok) {
    clientLogger.error("Ingest request failed", { status: response.status });
    throw new Error("Unable to trigger ingest");
  }

  return (await response.json()) as TriggerIngestResponse;
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
  const cacheHit = hourlyStatsResponseCache.get(days);
  if (cacheHit && Date.now() - cacheHit.fetchedAtMs < hourlyStatsClientCacheTtlMs) {
    return cacheHit.payload;
  }

  const existingRequest = hourlyStatsInFlight.get(days);
  if (existingRequest) {
    return existingRequest;
  }

  const nextRequest = (async (): Promise<MissionHourlyChannelEntry[]> => {
    const response = await fetch(`${base}/stats/channels/hourly?days=${days}`);
    if (!response.ok) {
      clientLogger.warn("Hourly channel stats unavailable", { status: response.status, days });
      return [];
    }

    const payload = (await response.json()) as MissionHourlyChannelEntry[];
    hourlyStatsResponseCache.set(days, { fetchedAtMs: Date.now(), payload });
    return payload;
  })();

  hourlyStatsInFlight.set(days, nextRequest);

  try {
    return await nextRequest;
  } finally {
    hourlyStatsInFlight.delete(days);
  }
};

export const fetchStatsDailyVolume = async (days = 5): Promise<MissionDailyVolumeData | null> => {
  const response = await fetch(`${base}/stats/daily-volume?days=${days}`);
  if (!response.ok) {
    clientLogger.warn("Daily transcript volume unavailable", { status: response.status, days });
    return null;
  }

  return (await response.json()) as MissionDailyVolumeData;
};


export const fetchTimeWindowSummary = async (hours: number): Promise<TimeWindowSummaryData> => {
  const response = await fetch(`${base}/time-window-summary?hours=${hours}`);
  if (!response.ok) {
    throw new Error("Unable to load time-window summary");
  }

  return (await response.json()) as TimeWindowSummaryData;
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
  const response = await fetch(`${base}/pipeline/notable-moments`, { cache: "no-store" });
  if (!response.ok) {
    clientLogger.warn("Notable moments unavailable", { status: response.status });
    return null;
  }

  return (await response.json()) as NotableMomentsData;
};

export const clearServerCaches = async (): Promise<{ accepted: boolean; status: string }> => {
  const response = await fetch(`${base}/cache/clear`, { method: "POST", cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to clear server caches");
  }

  return (await response.json()) as { accepted: boolean; status: string };
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

export const searchUtterances = async (
  query: string,
  limit = 8,
  options?: {
    channel?: string;
  }
): Promise<UtteranceSearchResponse> => {
  const channelParam =
    options?.channel && options.channel.trim().length > 0 ? `&channel=${encodeURIComponent(options.channel.trim())}` : "";
  const response = await fetch(`${base}/search/utterances?q=${encodeURIComponent(query)}&limit=${limit}${channelParam}`);
  if (!response.ok) {
    throw new Error("Unable to search utterances");
  }

  return (await response.json()) as UtteranceSearchResponse;
};

export const chat = async (
  query: string,
  mode: ChatMode = "rag_chat",
  options?: {
    channel?: string;
  }
): Promise<ChatResponse> => {
  const response = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, mode, channel: options?.channel?.trim() || undefined })
  });

  if (!response.ok) {
    throw new Error("Unable to run chat");
  }

  return (await response.json()) as ChatResponse;
};
