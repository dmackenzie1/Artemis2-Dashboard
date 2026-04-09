import { describe, expect, it } from "vitest";
import { TranscriptContextBuilder } from "./TranscriptContextBuilder.js";

const builder = new TranscriptContextBuilder();

describe("TranscriptContextBuilder", () => {
  it("prefers full-day documents over _partial variants sharing the same canonical name", () => {
    const groups = builder.buildDailyGroups([
      {
        path: "2026-04-04_summary_partial.csv",
        checksum: "partial-checksum",
        content: "partial-content"
      },
      {
        path: "2026-04-04_summary.csv",
        checksum: "full-checksum",
        content: "full-content"
      }
    ]);

    expect(groups).toEqual([
      {
        day: "2026-04-04",
        documents: [
          {
            path: "2026-04-04_summary.csv",
            checksum: "full-checksum",
            content: "full-content"
          }
        ]
      }
    ]);
  });

  it("splits very large documents into numbered part chunks", () => {
    const oversizedContent = "a".repeat(500_000);

    const chunks = builder.splitDayDocumentsIntoChunks([
      {
        path: "2026-04-04_summary.csv",
        checksum: "full-checksum",
        content: oversizedContent
      }
    ]);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.[0]?.path).toContain("#part-1");
    expect(chunks[1]?.[0]?.path).toContain("#part-2");
    expect(chunks.flat().map((document) => document.content).join("")).toEqual(oversizedContent);
  });

  it("filters source documents to only changed day keys", () => {
    const sourceContext = [
      {
        path: "2026-04-07_summary.csv",
        checksum: "checksum-1",
        content: "day-7-content"
      },
      {
        path: "2026-04-08_summary.csv",
        checksum: "checksum-2",
        content: "day-8-content"
      }
    ];

    expect(builder.filterSourceContextByDayKeys(sourceContext, new Set(["2026-04-08"]))).toEqual([
      {
        path: "2026-04-08_summary.csv",
        checksum: "checksum-2",
        content: "day-8-content"
      }
    ]);
  });
});
