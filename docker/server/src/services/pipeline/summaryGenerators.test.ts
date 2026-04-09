import { describe, expect, it } from "vitest";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { PromptDefinition } from "../../entities/PromptDefinition.js";
import { TranscriptContextBuilder } from "./TranscriptContextBuilder.js";
import { DailySummaryGenerator, NotableMomentsGenerator } from "./summaryGenerators.js";

describe("DailySummaryGenerator", () => {
  it("runs chunk-analysis prompts before day-level synthesis", async () => {
    const prompts: Array<{ componentId: string; userPrompt: string }> = [];
    const generator = new DailySummaryGenerator(
      {
        generateText: async (options) => {
          prompts.push({ componentId: options.componentId ?? "", userPrompt: options.userPrompt });
          if ((options.componentId ?? "").endsWith(":final")) {
            return "final day synthesis";
          }
          return `chunk-analysis-${prompts.length}`;
        }
      },
      new TranscriptContextBuilder()
    );

    const output = await generator.generateOutput(
      { key: "daily_summary", content: "daily system prompt" } as PromptDefinition,
      [
        {
          path: "2026-04-04_summary.csv",
          checksum: "checksum-1",
          content: "line-1\nline-2"
        }
      ]
    );

    expect(prompts.map((entry) => entry.componentId)).toEqual([
      "daily_summary:2026-04-04:chunk-1",
      "daily_summary:2026-04-04:final"
    ]);
    expect(output).toContain("## 2026-04-04");
    expect(output).toContain("final day synthesis");
  });
});

describe("NotableMomentsGenerator", () => {
  it("uses max target moments for high-signal transcript content", async () => {
    const promptPayloads: Array<{ targetMoments: number; dailySummary: string | null }> = [];
    const em = {
      find: async () => [
        {
          day: "2026-04-04",
          summary: "cached daily summary"
        }
      ]
    } as unknown as EntityManager;

    const generator = new NotableMomentsGenerator(
      {
        generateText: async (options) => {
          const parsed = JSON.parse(options.userPrompt) as { targetMoments: number; dailySummary: string | null };
          promptPayloads.push(parsed);
          return "notable output";
        }
      },
      () => em,
      new TranscriptContextBuilder(),
      {
        baselinePerDay: 10,
        minPerDay: 4,
        highSignalPerDay: 15,
        maxPerDay: 24
      }
    );

    const output = await generator.generateOutput(
      { key: "notable_moments", content: "notable system prompt" } as PromptDefinition,
      [
        {
          path: "2026-04-04_summary.csv",
          checksum: "checksum-1",
          content: "Critical burn confirmed near the other side of the moon"
        }
      ]
    );

    expect(promptPayloads[0]?.targetMoments).toBe(24);
    expect(promptPayloads[0]?.dailySummary).toBe("cached daily summary");
    const parsedOutput = JSON.parse(output) as { days: string[]; targetMomentsPerDay: number };
    expect(parsedOutput.days).toEqual(["notable output"]);
    expect(parsedOutput.targetMomentsPerDay).toBe(10);
  });
});
