import { describe, expect, it } from "vitest";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { LlmClient } from "./llmClient.js";
import { PipelineService } from "./pipelineService.js";

type SourceContextDocument = {
  path: string;
  checksum: string;
  content: string;
};

const createPipelineService = (): PipelineService => {
  const fakeEntityManager = {} as EntityManager;
  const llmClient = {
    generateText: async () => "stubbed-response"
  };

  return new PipelineService(() => fakeEntityManager, {
    sourceFilesDir: "/tmp/source-files",
    promptsDir: "/tmp/prompts",
    promptSubmissionsDir: "/tmp/prompt-submissions",
    llmClient: llmClient as unknown as LlmClient,
    notableMoments: {
      baselinePerDay: 10,
      minPerDay: 4,
      highSignalPerDay: 15,
      maxPerDay: 24
    }
  });
};

describe("PipelineService daily-summary grouping", () => {
  it("prefers full-day documents over _partial variants sharing the same canonical name", () => {
    const service = createPipelineService();
    const sourceContext: SourceContextDocument[] = [
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
    ];

    const dailyGroups = (service as unknown as {
      buildDailyGroups: (documents: SourceContextDocument[]) => Array<{ day: string; documents: SourceContextDocument[] }>;
    }).buildDailyGroups(sourceContext);

    expect(dailyGroups).toEqual([
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

  it("retains partial files when no canonical full-day source exists", () => {
    const service = createPipelineService();
    const sourceContext: SourceContextDocument[] = [
      {
        path: "2026-04-05_summary_partial.csv",
        checksum: "partial-checksum",
        content: "partial-content"
      }
    ];

    const dailyGroups = (service as unknown as {
      buildDailyGroups: (documents: SourceContextDocument[]) => Array<{ day: string; documents: SourceContextDocument[] }>;
    }).buildDailyGroups(sourceContext);

    expect(dailyGroups).toEqual([
      {
        day: "2026-04-05",
        documents: [
          {
            path: "2026-04-05_summary_partial.csv",
            checksum: "partial-checksum",
            content: "partial-content"
          }
        ]
      }
    ]);
  });
});

describe("PipelineService prompt queue ordering", () => {
  it("orders daily_summary ahead of mission_summary to enable summary-first mission synthesis", () => {
    const service = createPipelineService();
    const prompts = [
      { key: "mission_summary" },
      { key: "daily_summary" },
      { key: "top_topics" }
    ] as Array<{ key: string }>;

    const orderedPrompts = (service as unknown as {
      buildPromptQueue: (promptDefinitions: Array<{ key: string }>) => Array<{ key: string }>;
    }).buildPromptQueue(prompts);

    expect(orderedPrompts.map((prompt) => prompt.key)).toEqual(["daily_summary", "mission_summary", "top_topics"]);
  });
});

describe("PipelineService incremental daily targeting", () => {
  it("filters source documents to only changed day keys", () => {
    const service = createPipelineService();
    const sourceContext: SourceContextDocument[] = [
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

    const filtered = (service as unknown as {
      filterSourceContextByDayKeys: (documents: SourceContextDocument[], dayKeys: Set<string>) => SourceContextDocument[];
    }).filterSourceContextByDayKeys(sourceContext, new Set(["2026-04-08"]));

    expect(filtered).toEqual([
      {
        path: "2026-04-08_summary.csv",
        checksum: "checksum-2",
        content: "day-8-content"
      }
    ]);
  });
});
