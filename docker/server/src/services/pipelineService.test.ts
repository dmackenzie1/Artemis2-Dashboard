import { describe, expect, it } from "vitest";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { LlmClient } from "./llmClient.js";
import { PipelineService } from "./pipelineService.js";

const createPipelineService = (fakeEntityManager?: EntityManager): PipelineService => {
  const entityManager = fakeEntityManager ?? ({} as EntityManager);
  const llmClient = {
    generateText: async () => "stubbed-response"
  };

  return new PipelineService(() => entityManager, {
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

    expect(orderedPrompts.map((prompt) => prompt.key)).toEqual(["daily_summary", "mission_summary"]);
  });
});

describe("PipelineService prompt matrix state", () => {
  it("skips executions that do not resolve to a prompt key", async () => {
    const fakeEntityManager = {
      find: async (entity: { name?: string }) => {
        if (entity?.name === "PromptDefinition") {
          return [{ key: "daily_summary" }];
        }
        return [];
      },
      getConnection: () => ({
        execute: async () => [
          {
            id: 501,
            promptKey: "",
            responseDay: "2026-04-10",
            sentAt: new Date("2026-04-10T00:00:00Z"),
            startedAt: new Date("2026-04-10T00:00:00Z"),
            receivedAt: new Date("2026-04-10T00:01:00Z"),
            status: "success",
            errorMessage: null
          }
        ]
      })
    } as unknown as EntityManager;

    const service = createPipelineService(fakeEntityManager);
    (service as unknown as { listTranscriptDays: (limit: number) => Promise<string[]> }).listTranscriptDays = async () => [
      "2026-04-10"
    ];
    (service as unknown as { getLatestIngestAt: () => Promise<string | null> }).getLatestIngestAt = async () => null;

    const payload = await service.getPromptMatrixState(1);

    expect(payload.prompts).toHaveLength(1);
    expect(payload.prompts[0]?.key).toBe("daily_summary");
    expect(payload.prompts[0]?.cells[0]?.state).toBe("none");
  });

  it("maps dayGroups from submitted payload when responseDay is null", async () => {
    const fakeEntityManager = {
      find: async (entity: { name?: string }) => {
        if (entity?.name === "PromptDefinition") {
          return [{ key: "daily_summary_am" }];
        }
        return [];
      },
      getConnection: () => ({
        execute: async () => [
          {
            id: 777,
            promptKey: "daily_summary_am",
            responseDay: null,
            sentAt: new Date("2026-04-10T00:00:00Z"),
            startedAt: new Date("2026-04-10T00:00:00Z"),
            receivedAt: new Date("2026-04-10T00:01:00Z"),
            status: "success",
            errorMessage: null,
            submittedText: JSON.stringify({
              dayGroups: [{ day: "2026-04-01" }, { day: "2026-04-02" }]
            })
          }
        ]
      })
    } as unknown as EntityManager;

    const service = createPipelineService(fakeEntityManager);
    (service as unknown as { listTranscriptDays: (limit: number) => Promise<string[]> }).listTranscriptDays = async () => [];
    (service as unknown as { getLatestIngestAt: () => Promise<string | null> }).getLatestIngestAt = async () => null;

    const payload = await service.getPromptMatrixState(20);
    expect(payload.days).toEqual(["2026-04-01", "2026-04-02"]);
    expect(payload.prompts[0]?.cells.map((cell) => cell.state)).toEqual(["received", "received"]);
  });
});
