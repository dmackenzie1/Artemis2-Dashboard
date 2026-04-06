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
    llmClient: llmClient as unknown as LlmClient
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
