import { describe, expect, it } from "vitest";
import { compareTranscriptFiles, parseTranscriptFileName } from "./transcriptFileNaming.js";

describe("parseTranscriptFileName", () => {
  it("parses full-day file names", () => {
    expect(parseTranscriptFileName("2026-04-09_summary.csv")).toEqual({
      fileName: "2026-04-09_summary.csv",
      day: "2026-04-09",
      kind: "full-day",
      partialIndex: null,
      hourStart: 0,
      hourEnd: 23
    });
  });

  it("parses partial sequence file names", () => {
    expect(parseTranscriptFileName("2026-04-09_partial_2.csv")).toEqual({
      fileName: "2026-04-09_partial_2.csv",
      day: "2026-04-09",
      kind: "partial-sequence",
      partialIndex: 2,
      hourStart: null,
      hourEnd: null
    });
  });

  it("parses hour-range file names", () => {
    expect(parseTranscriptFileName("2026-04-09_12-23.csv")).toEqual({
      fileName: "2026-04-09_12-23.csv",
      day: "2026-04-09",
      kind: "hour-range",
      partialIndex: null,
      hourStart: 12,
      hourEnd: 23
    });
  });

  it("returns null for non day-prefixed files", () => {
    expect(parseTranscriptFileName("summary.csv")).toBeNull();
  });
});

describe("compareTranscriptFiles", () => {
  it("sorts out-of-order partial and hour-range files deterministically", () => {
    const sorted = [
      "2026-04-09_partial_2.csv",
      "2026-04-09_12-23.csv",
      "2026-04-08_summary.csv",
      "2026-04-09_00-06.csv",
      "2026-04-09_partial_1.csv"
    ].sort(compareTranscriptFiles);

    expect(sorted).toEqual([
      "2026-04-08_summary.csv",
      "2026-04-09_00-06.csv",
      "2026-04-09_12-23.csv",
      "2026-04-09_partial_1.csv",
      "2026-04-09_partial_2.csv"
    ]);
  });
});
