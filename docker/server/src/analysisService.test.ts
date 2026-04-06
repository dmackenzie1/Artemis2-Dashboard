import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnalysisService } from "./services/analysisService.js";
import type { TranscriptUtterance } from "./types.js";

const testPromptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../prompts");

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
      dataDir: "",
      promptsDir: "",
      cacheFile: "",
      llmClient: { generateText: async () => "", parseTopics: () => [] } as never
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
      dataDir: "",
      promptsDir: "",
      cacheFile: "",
      llmClient: { generateText: async () => "", parseTopics: () => [] } as never
    });

    expect(service.getTopNotableUtterances(10, 7)).toEqual([]);

    (service as unknown as { utterances: TranscriptUtterance[] }).utterances = [
      buildUtterance("1", "2026-04-05", "FLIGHT", "Nominal config update for comm uplink routing")
    ];

    const top = service.getTopNotableUtterances(999, 7);
    expect(top).toHaveLength(1);
  });
});

describe("AnalysisService RAG search and chat", () => {
  it("returns server-ranked utterances for search", () => {
    const service = new AnalysisService({
      dataDir: "",
      promptsDir: "",
      cacheFile: "",
      llmClient: { generateText: async () => "", parseTopics: () => [] } as never
    });

    (service as unknown as { utterances: TranscriptUtterance[] }).utterances = [
      buildUtterance("1", "2026-04-01", "ECLSS", "Cabin pressure leak trend is rising and requires watch"),
      buildUtterance("2", "2026-04-01", "FLIGHT", "Nominal systems update with no risk mentions"),
      buildUtterance("3", "2026-04-02", "ECLSS", "Leak response checklist completed by controller")
    ];

    const ranked = service.searchUtterances("cabin leak risk", 10);

    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.id).toBe("1");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it("uses rag mode evidence window for chat prompts", async () => {
    const llmClient = {
      generateText: async ({ userPrompt }: { userPrompt: string }) => userPrompt,
      parseTopics: () => []
    } as never;

    const service = new AnalysisService({
      dataDir: "",
      promptsDir: testPromptsDir,
      cacheFile: "",
      llmClient
    });

    (service as unknown as { utterances: TranscriptUtterance[] }).utterances = [
      buildUtterance("1", "2026-04-01", "ECLSS", "Cabin pressure leak trend is rising and requires watch"),
      buildUtterance("2", "2026-04-01", "FLIGHT", "Nominal systems update with no risk mentions")
    ];

    const payload = await service.chat("leak risk", "rag");
    expect(payload.strategy.mode).toBe("rag");
    expect(payload.strategy.contextUtterances).toBeGreaterThan(0);
    expect(payload.strategy.contextUtterances).toBeLessThanOrEqual(payload.strategy.totalUtterances);
    expect(payload.evidence[0]?.score).toBeGreaterThan(0);
  });
});
