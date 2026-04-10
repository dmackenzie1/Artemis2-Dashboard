import type { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../../lib/dayjs.js";
import { SummaryArtifact } from "../../entities/SummaryArtifact.js";
import type { PromptDefinition } from "../../entities/PromptDefinition.js";
import type { LlmClient } from "../llmClient.js";
import { dailySummaryChunkCharacterLimit, dailySummaryTargetWords } from "./pipelineTypes.js";
import type { SourceContextDocument } from "./pipelineTypes.js";
import type { TranscriptContextBuilder } from "./TranscriptContextBuilder.js";

const dailyFullSummaryType = "daily_full";
const canonicalChannelGroup = "*";

export interface SummaryPromptGenerator {
  readonly promptKey: "daily_summary_am" | "daily_summary_pm" | "daily_summary" | "notable_moments";
  generateOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string>;
}

type LlmTextGenerator = Pick<LlmClient, "generateText">;

export class HalfDaySummaryGenerator implements SummaryPromptGenerator {
  readonly promptKey: "daily_summary_am" | "daily_summary_pm";

  constructor(
    promptKey: "daily_summary_am" | "daily_summary_pm",
    private readonly llmClient: LlmTextGenerator,
    private readonly transcriptContextBuilder: TranscriptContextBuilder
  ) {
    this.promptKey = promptKey;
  }

  async generateOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const dayGroups = this.transcriptContextBuilder.buildDailyGroups(sourceContext);
    const segment = this.promptKey === "daily_summary_am" ? "AM (00:00-11:59 UTC)" : "PM (12:00-23:59 UTC)";
    const days = await Promise.all(
      dayGroups.map(async (group) => {
        const summary = await this.llmClient.generateText({
          systemPrompt: prompt.content,
          userPrompt: JSON.stringify(
            {
              mode: "daily-half-day-synthesis",
              segment,
              day: group.day,
              sourceDocuments: group.documents.map((document) => ({
                path: document.path,
                content: document.content
              }))
            },
            null,
            2
          ),
          componentId: `${prompt.key}:${group.day}`
        });

        return {
          day: group.day,
          summary
        };
      })
    );

    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        segment,
        days
      },
      null,
      2
    );
  }
}

export class DailySummaryGenerator implements SummaryPromptGenerator {
  readonly promptKey = "daily_summary" as const;

  constructor(
    private readonly llmClient: LlmTextGenerator,
    private readonly transcriptContextBuilder: TranscriptContextBuilder
  ) {}

  async generateOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const dayGroups = this.transcriptContextBuilder.buildDailyGroups(sourceContext);
    const dayOutputs: string[] = [];

    for (const group of dayGroups) {
      const documentChunks = this.transcriptContextBuilder.splitDayDocumentsIntoChunks(group.documents);
      const chunkOutputs: string[] = [];

      for (const [chunkIndex, chunkDocuments] of documentChunks.entries()) {
        const chunkOutput = await this.llmClient.generateText({
          systemPrompt: prompt.content,
          userPrompt: JSON.stringify(
            {
              mode: "daily-chunk-analysis",
              day: group.day,
              chunk: {
                index: chunkIndex + 1,
                total: documentChunks.length,
                maxCharacters: dailySummaryChunkCharacterLimit
              },
              instructions: {
                focus:
                  "Extract timeline events, anomalies, decisions, and mission-impactful details for this chunk. Preserve factual specificity for downstream synthesis."
              },
              sourceDocuments: chunkDocuments.map((document) => ({
                path: document.path,
                content: document.content
              }))
            },
            null,
            2
          ),
          componentId: `${prompt.key}:${group.day}:chunk-${chunkIndex + 1}`
        });

        chunkOutputs.push(chunkOutput);
      }

      const synthesizedDaySummary = await this.llmClient.generateText({
        systemPrompt: prompt.content,
        userPrompt: JSON.stringify(
          {
            mode: "daily-final-synthesis",
            day: group.day,
            instructions: {
              minimumWordTarget: dailySummaryTargetWords.min,
              maximumWordTarget: dailySummaryTargetWords.max,
              objective:
                "Generate the final reusable day summary by synthesizing chunk analyses while removing repetition and preserving chronology."
            },
            chunkSummaries: chunkOutputs.map((summary, index) => ({
              chunk: index + 1,
              summary
            }))
          },
          null,
          2
        ),
        componentId: `${prompt.key}:${group.day}:final`
      });

      dayOutputs.push(`## ${group.day}\n\n${synthesizedDaySummary}`);
    }

    return dayOutputs.join("\n\n");
  }
}

export class NotableMomentsGenerator implements SummaryPromptGenerator {
  readonly promptKey = "notable_moments" as const;

  constructor(
    private readonly llmClient: LlmTextGenerator,
    private readonly getEntityManager: () => EntityManager,
    private readonly transcriptContextBuilder: TranscriptContextBuilder,
    private readonly notableMomentsConfig: {
      baselinePerDay: number;
      minPerDay: number;
      highSignalPerDay: number;
      maxPerDay: number;
    }
  ) {}

  async generateOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const dayGroups = this.transcriptContextBuilder.buildDailyGroups(sourceContext);
    const em = this.getEntityManager();
    const persistedDailySummaries = await em.find(
      SummaryArtifact,
      { summaryType: dailyFullSummaryType, channelGroup: canonicalChannelGroup, day: { $in: dayGroups.map((group) => group.day) } },
      { orderBy: { day: "asc" } }
    );
    const summaryByDay = new Map(persistedDailySummaries.map((summary) => [summary.day, summary.summary]));
    const dayOutputs: string[] = [];

    for (const group of dayGroups) {
      const targetMoments = this.resolveTargetNotableMoments(group.documents);
      const output = await this.llmClient.generateText({
        systemPrompt: prompt.content,
        userPrompt: JSON.stringify(
          {
            mode: "daily-notable-moments",
            day: group.day,
            targetMoments,
            dailySummary: summaryByDay.get(group.day) ?? null,
            sourceDocuments: group.documents.map((document) => ({
              path: document.path,
              content: document.content
            }))
          },
          null,
          2
        ),
        componentId: `${prompt.key}:${group.day}`
      });

      dayOutputs.push(output);
    }

    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        targetMomentsPerDay: this.notableMomentsConfig.baselinePerDay,
        days: dayOutputs
      },
      null,
      2
    );
  }

  private resolveTargetNotableMoments(documents: SourceContextDocument[]): number {
    const estimatedUtterances = documents.reduce((total, document) => total + this.countNonEmptyLines(document.content), 0);
    const hasHighSignalMoment = documents.some((document) =>
      /exit(ing)? lunar|other side of the moon|president|breakthrough|critical|anomaly|dock|undock|burn/iu.test(document.content)
    );

    if (hasHighSignalMoment || estimatedUtterances >= 1_800) {
      return this.notableMomentsConfig.maxPerDay;
    }

    if (estimatedUtterances >= 900) {
      return this.notableMomentsConfig.highSignalPerDay;
    }

    return Math.max(this.notableMomentsConfig.minPerDay, this.notableMomentsConfig.baselinePerDay);
  }

  private countNonEmptyLines(content: string): number {
    return content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
  }
}

export const createSummaryPromptGenerators = (dependencies: {
  llmClient: LlmTextGenerator;
  getEntityManager: () => EntityManager;
  transcriptContextBuilder: TranscriptContextBuilder;
  notableMomentsConfig: {
    baselinePerDay: number;
    minPerDay: number;
    highSignalPerDay: number;
    maxPerDay: number;
  };
} ): Map<SummaryPromptGenerator["promptKey"], SummaryPromptGenerator> => {
  const dailyAmGenerator = new HalfDaySummaryGenerator("daily_summary_am", dependencies.llmClient, dependencies.transcriptContextBuilder);
  const dailyPmGenerator = new HalfDaySummaryGenerator("daily_summary_pm", dependencies.llmClient, dependencies.transcriptContextBuilder);
  const dailyGenerator = new DailySummaryGenerator(dependencies.llmClient, dependencies.transcriptContextBuilder);
  const notableGenerator = new NotableMomentsGenerator(
    dependencies.llmClient,
    dependencies.getEntityManager,
    dependencies.transcriptContextBuilder,
    dependencies.notableMomentsConfig
  );

  return new Map<SummaryPromptGenerator["promptKey"], SummaryPromptGenerator>([
    [dailyAmGenerator.promptKey, dailyAmGenerator],
    [dailyPmGenerator.promptKey, dailyPmGenerator],
    [dailyGenerator.promptKey, dailyGenerator],
    [notableGenerator.promptKey, notableGenerator]
  ]);
};
