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
    fileName: string;
    promptUpdatedAt: string;
    lastRunAt: string | null;
    status: "running" | "success" | "failed" | "never";
    submittedText: string | null;
    output: string | null;
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

export type ChatMode = "rag" | "all";

export type ChatResponse = {
  answer: string;
  evidence: Array<{ timestamp: string; channel: string; text: string; filename: string }>;
  strategy: {
    mode: ChatMode;
    totalUtterances: number;
    contextUtterances: number;
    wasTruncated: boolean;
  };
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

export const fetchHealth = async (): Promise<HealthData> => {
  const response = await fetch(`${base}/health`);
  if (!response.ok) {
    throw new Error("Unable to load health status");
  }

  return (await response.json()) as HealthData;
};

export const chat = async (query: string, mode: ChatMode = "rag"): Promise<ChatResponse> => {
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
