import { describe, expect, it } from "vitest";
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
  filename: `file-${id}.csv`,
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
