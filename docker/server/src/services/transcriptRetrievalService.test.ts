import { describe, expect, it } from "vitest";
import { retrieveRankedUtterances } from "./transcriptRetrievalService.js";
import type { TranscriptUtterance } from "../types.js";

const buildUtterance = (id: string, text: string, channel = "FLIGHT"): TranscriptUtterance => ({
  id,
  timestamp: "2026-04-06T12:00:00Z",
  day: "2026-04-06",
  hour: "12:00",
  channel,
  durationSec: 10,
  language: "en",
  translated: "no",
  text,
  filename: `file-${id}.csv`,
  sourceFile: `file-${id}.csv`
});

describe("retrieveRankedUtterances", () => {
  it("ranks utterances based on token overlap", () => {
    const result = retrieveRankedUtterances(
      "cabin pressure warning",
      [
        buildUtterance("1", "Nominal comm check complete"),
        buildUtterance("2", "Cabin pressure warning trend detected"),
        buildUtterance("3", "Pressure is stable")
      ],
      2
    );

    expect(result.queryTokens).toContain("cabin");
    expect(result.ranked).toHaveLength(2);
    expect(result.ranked[0]?.filename).toBe("file-2.csv");
    expect(result.ranked[0]?.score).toBeGreaterThan(result.ranked[1]?.score ?? 0);
  });
});
