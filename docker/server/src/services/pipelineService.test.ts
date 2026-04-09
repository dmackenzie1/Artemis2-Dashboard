import { describe, expect, it } from "vitest";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { LlmClient } from "./llmClient.js";
import { PipelineService } from "./pipelineService.js";

const createPipelineService = (): PipelineService => {
  const fakeEntityManager = {} as EntityManager;
  const llmClient = {
    generateText: async () => "stubbed-response"
  };

  return new PipelineService(() => fakeEntityManager, {
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
