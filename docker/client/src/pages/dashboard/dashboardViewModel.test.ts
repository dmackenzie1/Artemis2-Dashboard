import { describe, expect, it } from "vitest";
import type { DashboardData, MissionStatsSummaryData, PipelineDashboardData } from "../../api";
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

  it("shows only the latest day section when daily summary prompt output includes multiple days", () => {
    const dashboardData = {
      ...createDashboardData("Mission summary from ingestion cache"),
      days: [
        {
          day: "2026-04-05",
          summary: "day 5 summary",
          hourly: {},
          topics: [],
          stats: { utteranceCount: 1, wordCount: 10, channelCount: 1, hourlyUtterances: {} }
        },
        {
          day: "2026-04-06",
          summary: "day 6 summary",
          hourly: {},
          topics: [],
          stats: { utteranceCount: 2, wordCount: 20, channelCount: 1, hourlyUtterances: {} }
        }
      ]
    };

    const pipeline = createPipeline([
      {
        id: 2,
        key: "daily_summary",
        componentId: "daily_summary",
        fileName: "daily_summary.txt",
        promptUpdatedAt: "2026-04-05T00:00:00Z",
        lastRunAt: "2026-04-06T00:20:00Z",
        status: "success",
        cacheHit: false,
        submittedPreview: null,
        outputPreview: "## 2026-04-06",
        submittedText: null,
        output: "## 2026-04-05\n\nOlder day summary\n\n## 2026-04-06\n\nCurrent day summary",
        errorMessage: null
      }
    ]);

    const viewModel = buildDashboardViewModel(dashboardData, pipeline, null);

    expect(viewModel.dailySummary.statusLabel).toBe("ready");
    expect(viewModel.dailySummary.text).toBe("## 2026-04-06\n\nCurrent day summary");
  });

  it("falls back to the latest ingested day summary when daily prompt output is unavailable", () => {
    const dashboardData = {
      ...createDashboardData("Mission summary from ingestion cache"),
      recentChanges: "older changes text",
      days: [
        {
          day: "2026-04-05",
          summary: "day 5 summary",
          hourly: {},
          topics: [],
          stats: { utteranceCount: 1, wordCount: 10, channelCount: 1, hourlyUtterances: {} }
        },
        {
          day: "2026-04-06",
          summary: "latest day summary from dashboard cache",
          hourly: {},
          topics: [],
          stats: { utteranceCount: 2, wordCount: 20, channelCount: 1, hourlyUtterances: {} }
        }
      ]
    };

    const viewModel = buildDashboardViewModel(dashboardData, null, null);

    expect(viewModel.dailySummary.statusLabel).toBe("ready");
    expect(viewModel.dailySummary.text).toBe("latest day summary from dashboard cache");
  });

  it("keeps transcript metrics in loading state until stats summary payload arrives", () => {
    const dashboardData = createDashboardData("Mission summary from ingestion cache");

    const viewModel = buildDashboardViewModel(dashboardData, null, null);

    expect(viewModel.stats).toEqual([]);
  });

  it("renders transcript metrics when stats summary payload is available", () => {
    const dashboardData = createDashboardData("Mission summary from ingestion cache");
    const statsSummary: MissionStatsSummaryData = {
      generatedAt: "2026-04-06T00:00:00Z",
      days: {
        minDay: "2026-04-01",
        maxDay: "2026-04-06"
      },
      totals: {
        utterances: 1234,
        words: 5678,
        channels: 9
      }
    };

    const viewModel = buildDashboardViewModel(dashboardData, null, statsSummary);

    expect(viewModel.stats).toEqual([
      { label: "Min Day", value: "2026-04-01" },
      { label: "Max Day", value: "2026-04-06" },
      { label: "Total Utterances", value: "1234" },
      { label: "Total Words", value: "5678" },
      { label: "Distinct Channels", value: "9" }
    ]);
  });

});
