import { describe, expect, it } from "vitest";
import { selectStratifiedHourlySample } from "./timeWindowSummaryService.js";

type SampleRow = {
  timestamp: string;
  channel: string;
  text: string;
  filename: string;
  sourceFile: string;
  wordCount: string;
};

const buildRow = (index: number, overrides: Partial<SampleRow> = {}): SampleRow => ({
  timestamp: `2026-04-09T${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00Z`,
  channel: "MAIN",
  text: `routine update ${index}`,
  filename: "2026-04-09_summary.csv",
  sourceFile: "2026-04-09_summary.csv",
  wordCount: "5",
  ...overrides
});

describe("selectStratifiedHourlySample", () => {
  it("returns deterministic representatives with early/mid/late coverage", () => {
    const utterances = Array.from({ length: 40 }, (_, index) => buildRow(index));

    const firstRun = selectStratifiedHourlySample(utterances, 12);
    const secondRun = selectStratifiedHourlySample(utterances, 12);

    expect(firstRun).toEqual(secondRun);
    expect(firstRun[0]?.timestamp).toBe(utterances[0]?.timestamp);
    expect(firstRun.some((entry) => entry.timestamp === utterances[Math.floor((utterances.length - 1) / 2)]?.timestamp)).toBe(true);
    expect(firstRun[firstRun.length - 1]?.timestamp).toBe(utterances[utterances.length - 1]?.timestamp);
  });

  it("prioritizes anomaly and rare-channel utterances under skewed inputs", () => {
    const mostlyRoutine = Array.from({ length: 70 }, (_, index) => buildRow(index));
    const anomaly = buildRow(70, {
      text: "Warning: off-nominal guidance drift detected",
      channel: "GUIDANCE",
      wordCount: "42"
    });
    const rareChannel = buildRow(71, {
      text: "Loop handover to EVA",
      channel: "EVA",
      wordCount: "18"
    });

    const sample = selectStratifiedHourlySample([...mostlyRoutine, anomaly, rareChannel], 12);

    expect(sample).toContainEqual(anomaly);
    expect(sample).toContainEqual(rareChannel);
  });
});
