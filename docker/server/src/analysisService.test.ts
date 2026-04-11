import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnalysisService } from "./services/analysisService.js";
import type { TranscriptUtterance } from "./types.js";

const buildUtterance = (id: string, day: string, channel: string, text: string): TranscriptUtterance => ({
  id,
  timestamp: `${day}T12:00:00Z`,
  day,
  hour: "12:00",
  channel,
  durationSec: 6,
  language: "en",
  translated: text,
  text,
  audioFileName: `file-${id}.csv`,
  sourceFile: `file-${id}.csv`
});

describe("AnalysisService.getTopNotableUtterances", () => {
  it("returns highest-ranked utterances within the requested day window", () => {
    const service = new AnalysisService({
      promptsDir: "",
      cacheFile: "",
      llmClient: { generateText: async () => "", parseTopics: () => [] } as never,
      llmMaxTokens: 12000,
      loadTranscriptUtterances: async () => []
    });

    (service as unknown as { utterances: TranscriptUtterance[] }).utterances = [
      buildUtterance("1", "2026-04-01", "ORION MER MANAGER", "Nominal timeline review complete"),
      buildUtterance("2", "2026-04-03", "ORION ECLSS", "We have anomaly concern with cabin pressure leak trend"),
      buildUtterance("3", "2026-04-05", "FLIGHT", "Urgent fault isolation is now in progress")
    ];

    const top = service.getTopNotableUtterances(2, 3);

    expect(top).toHaveLength(2);
    expect(top[0]?.id).toBe("3");
    expect(top.map((entry) => entry.id)).not.toContain("1");
    expect(top[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("clamps limit boundaries and returns empty state safely", () => {
    const service = new AnalysisService({
      promptsDir: "",
      cacheFile: "",
      llmClient: { generateText: async () => "", parseTopics: () => [] } as never,
      llmMaxTokens: 12000,
      loadTranscriptUtterances: async () => []
    });

    expect(service.getTopNotableUtterances(10, 7)).toEqual([]);

    (service as unknown as { utterances: TranscriptUtterance[] }).utterances = [
      buildUtterance("1", "2026-04-05", "FLIGHT", "Nominal config update for comm uplink routing")
    ];

    const top = service.getTopNotableUtterances(999, 7);
    expect(top).toHaveLength(1);
  });
});

describe("AnalysisService ingest placeholder gating", () => {
  it("skips mission-summary LLM call when daily summaries are placeholders", async () => {
    const promptsDir = await mkdtemp(path.join(os.tmpdir(), "analysis-prompts-"));
    const cacheFile = path.join(promptsDir, "cache.json");

    await Promise.all([
      writeFile(path.join(promptsDir, "hourly_summary.txt"), "hourly", "utf8"),
      writeFile(path.join(promptsDir, "top_topics.txt"), "topics", "utf8"),
      writeFile(path.join(promptsDir, "mission_summary.txt"), "mission", "utf8"),
      writeFile(path.join(promptsDir, "recent_changes.txt"), "recent", "utf8")
    ]);

    const generateText = vi.fn(async ({ componentId }: { componentId?: string }) => {
      if (componentId?.includes("hourly_summary")) {
        return JSON.stringify({ "12:00": "Hourly note" });
      }

      if (componentId?.includes("top_topics")) {
        return JSON.stringify([
          {
            title: "Systems",
            description: "Systems coordination",
            channels: ["FLIGHT"],
            mentionTimestamps: ["12:00"]
          }
        ]);
      }

      return "recent output";
    });

    const service = new AnalysisService({
      promptsDir,
      cacheFile,
      llmClient: { generateText, parseTopics: (raw: string) => JSON.parse(raw) } as never,
      llmMaxTokens: 12000,
      loadTranscriptUtterances: async () => [buildUtterance("1", "2026-04-05", "FLIGHT", "Nominal update")],
      loadDailySummaryForDay: async () => null
    });

    const cache = await service.ingestAndAnalyze();

    expect(cache.missionSummary).toContain("deferred");
    expect(generateText).not.toHaveBeenCalledWith(expect.objectContaining({ componentId: "analysis/mission_summary" }));

    await rm(promptsDir, { recursive: true, force: true });
  });
});
