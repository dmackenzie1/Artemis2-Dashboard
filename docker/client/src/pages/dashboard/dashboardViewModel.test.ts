import { describe, expect, it } from "vitest";
import type { DashboardData, PipelineDashboardData } from "../../api";
import { buildDashboardViewModel } from "./dashboardViewModel";

const createDashboardData = (missionSummary: string): DashboardData => ({
  generatedAt: "2026-04-06T00:00:00Z",
  missionSummary,
  recentChanges: "recent",
  days: [
    {
      day: "2026-04-05",
      summary: "daily",
      hourly: {},
      topics: [],
      stats: { utteranceCount: 1, wordCount: 10, channelCount: 1, hourlyUtterances: {} }
    }
  ]
});

const createPipeline = (prompts: PipelineDashboardData["prompts"]): PipelineDashboardData => ({
  generatedAt: "2026-04-06T00:00:00Z",
  prompts
});

describe("buildDashboardViewModel", () => {
  it("falls back to dashboard mission summary when pipeline prompt is unavailable", () => {
    const dashboardData = createDashboardData("Mission summary from ingestion cache");

    const viewModel = buildDashboardViewModel(dashboardData, null, null);

    expect(viewModel.missionSummary.statusLabel).toBe("ready");
    expect(viewModel.missionSummary.text).toBe("Mission summary from ingestion cache");
    expect(viewModel.missionSummary.lastRunAt).toBe("2026-04-06T00:00:00Z");
  });

  it("prefers mission summary prompt output when pipeline prompt execution exists", () => {
    const dashboardData = createDashboardData("Mission summary from ingestion cache");
    const pipeline = createPipeline([
      {
        id: 1,
        key: "mission_summary",
        componentId: "mission_summary",
        fileName: "mission_summary.txt",
        promptUpdatedAt: "2026-04-05T00:00:00Z",
        lastRunAt: "2026-04-06T00:10:00Z",
        status: "success",
        cacheHit: false,
        submittedPreview: null,
        outputPreview: "Pipeline output",
        submittedText: null,
        output: "Pipeline output",
        errorMessage: null
      }
    ]);

    const viewModel = buildDashboardViewModel(dashboardData, pipeline, null);

    expect(viewModel.missionSummary.statusLabel).toBe("ready");
    expect(viewModel.missionSummary.text).toBe("Pipeline output");
    expect(viewModel.missionSummary.lastRunAt).toBe("2026-04-06T00:10:00Z");
  });
});
