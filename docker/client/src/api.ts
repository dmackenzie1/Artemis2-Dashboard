export type DashboardData = {
  generatedAt: string;
  missionSummary: string;
  recentChanges: string;
  days: Array<{
    day: string;
    summary: string;
    hourly: Record<string, string>;
    topics: Array<{ title: string; description: string }>;
    stats: { utteranceCount: number; wordCount: number; channelCount: number };
  }>;
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
  const response = await fetch(`${base}/ingest`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Unable to ingest data");
  }

  return (await response.json()) as DashboardData;
};

export const chat = async (query: string): Promise<{ answer: string; evidence: Array<{ timestamp: string; channel: string; text: string; filename: string }> }> => {
  const response = await fetch(`${base}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error("Unable to run chat");
  }

  return (await response.json()) as { answer: string; evidence: Array<{ timestamp: string; channel: string; text: string; filename: string }> };
};
