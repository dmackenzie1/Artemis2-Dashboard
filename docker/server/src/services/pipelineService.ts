import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../lib/dayjs.js";
import { PromptDefinition } from "../entities/PromptDefinition.js";
import { PromptExecution } from "../entities/PromptExecution.js";
import { SummaryArtifact } from "../entities/SummaryArtifact.js";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

type EntityManagerProvider = () => EntityManager;

type PipelineConfig = {
  promptsDir: string;
  llmClient: LlmClient;
  promptSubmissionsDir: string;
  notableMoments: {
    baselinePerDay: number;
    minPerDay: number;
    highSignalPerDay: number;
    maxPerDay: number;
  };
};

type PromptDashboardEntry = {
  id: number;
  key: string;
  componentId: string;
  fileName: string;
  promptUpdatedAt: string;
  lastRunAt: string | null;
  status: "running" | "success" | "failed" | "never";
  cacheHit: boolean;
  submittedPreview: string | null;
  outputPreview: string | null;
  submittedText: string | null;
  output: string | null;
  errorMessage: string | null;
};

type MissionStatsHistogramBucket = {
  hour: string;
  utterances: number;
};

type MissionStatsView = {
  generatedAt: string;
  range: {
    minTimestamp: string | null;
    maxTimestamp: string | null;
  };
  totals: {
    dataDays: number;
    utterances: number;
    lines: number;
    words: number;
  };
  utterancesPerHour: MissionStatsHistogramBucket[];
};

const promptFilePattern = /\.txt$/i;
const runnablePromptKeys = new Set(["daily_summary", "mission_summary", "recent_changes", "notable_moments"]);
const promptExecutionPriority = ["daily_summary", "notable_moments", "mission_summary"];
const skippedPromptKeys = new Set(["hourly_summary"]);
const dailySummaryTargetWords = {
  min: 5_000,
  max: 10_000
} as const;
const dailySummaryChunkCharacterLimit = 220_000;
const missionStatsCacheTtlMs = 5 * 60 * 1000;
const canonicalChannelGroup = "*";
const dailyFullSummaryType = "daily_full";

type SourceContextDocument = {
  path: string;
  checksum: string;
  content: string;
};

type DailyDocumentGroup = {
  day: string;
  documents: SourceContextDocument[];
};

type DailyDocumentVariant = {
  canonicalPath: string;
  isPartial: boolean;
};

type ParsedSummaryArtifactSection = {
  day: string;
  summary: string;
};

type PromptDefinitionSyncResult = {
  changedPrompts: number;
  changedPromptKeys: string[];
};

type SummaryArtifactView = {
  id: number;
  summaryType: string;
  day: string;
  periodStart: string;
  periodEnd: string;
  channelGroup: string;
  summary: string;
  generatedAt: string;
  updatedAt: string;
  wordCount: number;
  utteranceCount: number;
  sourceDocumentCount: number;
};

export class PipelineService {
  private runInProgress = false;
  private missionStatsCache: { computedAtMs: number; payload: MissionStatsView } | null = null;

  constructor(
    private readonly getEntityManager: EntityManagerProvider,
    private readonly config: PipelineConfig
  ) {}

  private async persistPromptSubmission(promptKey: string, submittedText: string): Promise<string> {
    const timestamp = dayjs().utc().format("YYYYMMDDTHHmmssSSS");
    const fileName = `${timestamp}-${promptKey}.json`;
    const outputPath = path.join(this.config.promptSubmissionsDir, fileName);

    await fs.mkdir(this.config.promptSubmissionsDir, { recursive: true });
    await fs.writeFile(outputPath, submittedText, "utf8");

    return outputPath;
  }

  private createPreview(text: string, maxChars: number, maxLines: number): string {
    const allLines = text.split(/\r?\n/u);
    const lines = allLines.slice(0, maxLines);
    const joined = lines.join("\n");
    if (joined.length <= maxChars && lines.length === allLines.length) {
      return joined;
    }

    return `${joined.slice(0, maxChars)}…`;
  }

  private deriveDayKey(relativePath: string): string {
    const normalized = relativePath.toLowerCase();
    const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/u);
    if (dateMatch?.[1]) {
      return dateMatch[1];
    }

    const dayNumberMatch = normalized.match(/\bday[\s_-]?(\d{1,3})\b/u);
    if (dayNumberMatch?.[1]) {
      return `day-${dayNumberMatch[1].padStart(2, "0")}`;
    }

    return "unspecified-day";
  }

  private deriveDailyDocumentVariant(relativePath: string): DailyDocumentVariant {
    const parsedPath = path.parse(relativePath);
    const isPartial = /_partial$/iu.test(parsedPath.name);
    const canonicalName = isPartial ? parsedPath.name.replace(/_partial$/iu, "") : parsedPath.name;
    return {
      canonicalPath: path.join(parsedPath.dir, `${canonicalName}${parsedPath.ext}`),
      isPartial
    };
  }

  private resolveDailyGroupDocuments(documents: SourceContextDocument[]): SourceContextDocument[] {
    const preferredByCanonicalPath = documents.reduce<Map<string, SourceContextDocument>>((selected, document) => {
      const variant = this.deriveDailyDocumentVariant(document.path);
      const existing = selected.get(variant.canonicalPath);

      if (!existing) {
        selected.set(variant.canonicalPath, document);
        return selected;
      }

      const existingVariant = this.deriveDailyDocumentVariant(existing.path);
      if (existingVariant.isPartial && !variant.isPartial) {
        selected.set(variant.canonicalPath, document);
      }

      return selected;
    }, new Map<string, SourceContextDocument>());

    return [...preferredByCanonicalPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  }

  private buildDailyGroups(sourceContext: SourceContextDocument[]): DailyDocumentGroup[] {
    const groupedByDay = sourceContext.reduce<Map<string, SourceContextDocument[]>>((grouped, document) => {
      const dayKey = this.deriveDayKey(document.path);
      const documents = grouped.get(dayKey) ?? [];
      documents.push(document);
      grouped.set(dayKey, documents);
      return grouped;
    }, new Map<string, SourceContextDocument[]>());

    return [...groupedByDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, documents]) => ({ day, documents: this.resolveDailyGroupDocuments(documents) }));
  }

  private createSummaryArtifactCacheSubmission(sourceContext: SourceContextDocument[]): string {
    const groupedDays = this.buildDailyGroups(sourceContext);
    serverLogger.info("Prepared grouped daily-summary source document manifest", {
      groupedDayCount: groupedDays.length,
      groupedDays: groupedDays.map((group) => ({
        day: group.day,
        documentCount: group.documents.length,
        documents: group.documents.map((document) => document.path)
      }))
    });

    const dayGroups = groupedDays.map((group) => ({
      day: group.day,
      sourceDocuments: group.documents.map((document) => ({
        path: document.path,
        checksum: document.checksum
      })),
      instructions: {
        minimumWordTarget: dailySummaryTargetWords.min,
        maximumWordTarget: dailySummaryTargetWords.max,
        objective:
          "Produce a detailed day-level summary that can be cached in the database and reused by mission-level summaries."
      }
    }));

    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        strategy: "daily-layer-first",
        chunking: {
          maxCharactersPerChunk: dailySummaryChunkCharacterLimit
        },
        dayGroups
      },
      null,
      2
    );
  }

  private async buildPromptSubmission(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    if (prompt.key === "daily_summary") {
      return this.createSummaryArtifactCacheSubmission(sourceContext);
    }

    if (prompt.key === "recent_changes") {
      const groupedDays = this.buildDailyGroups(sourceContext);
      const latestWindowGroups = groupedDays.slice(-2);

      return JSON.stringify(
        {
          generatedAt: dayjs().utc().toISOString(),
          strategy: "rolling-24h-vs-prior-baseline",
          window: {
            latestDays: latestWindowGroups.length,
            targetRollingHours: 24
          },
          dayGroups: latestWindowGroups.map((group) => ({
            day: group.day,
            sourceDocuments: group.documents.map((document) => ({
              path: document.path,
              checksum: document.checksum,
              content: document.content
            }))
          }))
        },
        null,
        2
      );
    }

    if (prompt.key === "notable_moments") {
      const groupedDays = this.buildDailyGroups(sourceContext);
      return JSON.stringify(
        {
          generatedAt: dayjs().utc().toISOString(),
          strategy: "daily-notable-moments",
          dayGroups: groupedDays.map((group) => ({
            day: group.day,
            sourceDocuments: group.documents.map((document) => ({
              path: document.path,
              checksum: document.checksum
            })),
            targetMoments: this.config.notableMoments.baselinePerDay
          }))
        },
        null,
        2
      );
    }

    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        sourceDocuments: sourceContext
      },
      null,
      2
    );
  }

  private splitDayDocumentsIntoChunks(documents: SourceContextDocument[]): SourceContextDocument[][] {
    const chunks: SourceContextDocument[][] = [];
    let currentChunk: SourceContextDocument[] = [];
    let currentCharacterCount = 0;

    for (const document of documents) {
      const documentCharacters = document.content.length;
      if (currentChunk.length > 0 && currentCharacterCount + documentCharacters > dailySummaryChunkCharacterLimit) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCharacterCount = 0;
      }

      if (documentCharacters > dailySummaryChunkCharacterLimit) {
        const parts = Math.max(Math.ceil(documentCharacters / dailySummaryChunkCharacterLimit), 1);
        const partSize = Math.ceil(documentCharacters / parts);

        for (let partIndex = 0; partIndex < parts; partIndex += 1) {
          const start = partIndex * partSize;
          const end = Math.min(start + partSize, documentCharacters);
          const partContent = document.content.slice(start, end);
          chunks.push([
            {
              ...document,
              path: `${document.path}#part-${partIndex + 1}`,
              content: partContent
            }
          ]);
        }
        continue;
      }

      currentChunk.push(document);
      currentCharacterCount += documentCharacters;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async generateSummaryArtifactOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const dayGroups = this.buildDailyGroups(sourceContext);
    const dayOutputs: string[] = [];
    serverLogger.info("Starting daily summary layered generation", {
      groupedDayCount: dayGroups.length
    });

    for (const group of dayGroups) {
      const documentChunks = this.splitDayDocumentsIntoChunks(group.documents);
      const chunkOutputs: string[] = [];
      serverLogger.info("Processing daily summary group", {
        day: group.day,
        sourceDocumentCount: group.documents.length,
        chunkCount: documentChunks.length
      });

      for (const [chunkIndex, chunkDocuments] of documentChunks.entries()) {
        const chunkOutput = await this.config.llmClient.generateText({
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

      const synthesizedDaySummary = await this.config.llmClient.generateText({
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

  private async generateNotableMomentsOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const dayGroups = this.buildDailyGroups(sourceContext);
    const em = this.getEntityManager();
    const persistedDailySummaries = await em.find(
      SummaryArtifact,
      { summaryType: dailyFullSummaryType, channelGroup: canonicalChannelGroup, day: { $in: dayGroups.map((group) => group.day) } },
      { orderBy: { day: "asc" } }
    );
    const summaryByDay = new Map(persistedDailySummaries.map((summary) => [summary.day, summary.summary]));
    const dayOutputs: string[] = [];
    serverLogger.info("Starting notable moments generation", {
      groupedDayCount: dayGroups.length,
      target: this.config.notableMoments
    });

    for (const group of dayGroups) {
      const targetMoments = this.resolveTargetNotableMoments(group.documents);
      const output = await this.config.llmClient.generateText({
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
        targetMomentsPerDay: this.config.notableMoments.baselinePerDay,
        days: dayOutputs
      },
      null,
      2
    );
  }

  private buildPromptQueue(prompts: PromptDefinition[]): PromptDefinition[] {
    const indexByKey = new Map<string, number>(promptExecutionPriority.map((key, index) => [key, index]));

    return prompts
      .filter((prompt) => runnablePromptKeys.has(prompt.key) && !skippedPromptKeys.has(prompt.key))
      .sort((left, right) => {
        const leftPriority = indexByKey.get(left.key);
        const rightPriority = indexByKey.get(right.key);

        if (typeof leftPriority === "number" && typeof rightPriority === "number") {
          return leftPriority - rightPriority;
        }

        if (typeof leftPriority === "number") {
          return -1;
        }

        if (typeof rightPriority === "number") {
          return 1;
        }

        return left.key.localeCompare(right.key);
      });
  }

  private countNonEmptyLines(content: string): number {
    return content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
  }

  private resolveTargetNotableMoments(documents: SourceContextDocument[]): number {
    const estimatedUtterances = documents.reduce((total, document) => total + this.countNonEmptyLines(document.content), 0);
    const hasHighSignalMoment = documents.some((document) =>
      /exit(ing)? lunar|other side of the moon|president|breakthrough|critical|anomaly|dock|undock|burn/iu.test(document.content)
    );

    if (hasHighSignalMoment || estimatedUtterances >= 1_800) {
      return this.config.notableMoments.maxPerDay;
    }

    if (estimatedUtterances >= 900) {
      return this.config.notableMoments.highSignalPerDay;
    }

    return Math.max(this.config.notableMoments.minPerDay, this.config.notableMoments.baselinePerDay);
  }

  private parseSummaryArtifactSections(output: string): ParsedSummaryArtifactSection[] {
    const sections: ParsedSummaryArtifactSection[] = [];
    const sectionPattern = /^##\s+(.+?)\n+([\s\S]*?)(?=^##\s+.+?$|$)/gmu;
    let match = sectionPattern.exec(output);

    while (match) {
      const day = match[1]?.trim();
      const summary = match[2]?.trim() ?? "";
      if (day && summary) {
        sections.push({ day, summary });
      }
      match = sectionPattern.exec(output);
    }

    return sections;
  }

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }
    return trimmed.split(/\s+/u).length;
  }

  private async persistSummaryArtifacts(output: string, sourceContext: SourceContextDocument[]): Promise<void> {
    const em = this.getEntityManager();
    const dayGroupsByDay = new Map(this.buildDailyGroups(sourceContext).map((group) => [group.day, group]));
    const parsedSections = this.parseSummaryArtifactSections(output);
    const generatedAt = dayjs().utc().toDate();

    for (const section of parsedSections) {
      const group = dayGroupsByDay.get(section.day);
      const utteranceCount = group?.documents.reduce(
        (total, document) => total + this.countNonEmptyLines(document.content),
        0
      ) ?? 0;
      const sourceDocumentCount = group?.documents.length ?? 0;
      const periodStart = dayjs(`${section.day}T00:00:00Z`).utc().toDate();
      const periodEnd = dayjs(`${section.day}T23:59:59.999Z`).utc().toDate();
      const sourceChecksum = crypto
        .createHash("sha256")
        .update(group?.documents.map((document) => `${document.path}:${document.checksum}`).join("|") ?? "")
        .digest("hex");
      const existing = await em.findOne(SummaryArtifact, {
        summaryType: dailyFullSummaryType,
        periodStart,
        periodEnd,
        channelGroup: canonicalChannelGroup
      });

      if (!existing) {
        em.persist(
          em.create(SummaryArtifact, {
            summaryType: dailyFullSummaryType,
            day: section.day,
            periodStart,
            periodEnd,
            channelGroup: canonicalChannelGroup,
            summary: section.summary,
            generatedAt,
            updatedAt: generatedAt,
            wordCount: this.countWords(section.summary),
            utteranceCount,
            sourceDocumentCount,
            sourceChecksum
          })
        );
        continue;
      }

      existing.summaryType = dailyFullSummaryType;
      existing.summary = section.summary;
      existing.day = section.day;
      existing.periodStart = periodStart;
      existing.periodEnd = periodEnd;
      existing.generatedAt = generatedAt;
      existing.updatedAt = generatedAt;
      existing.wordCount = this.countWords(section.summary);
      existing.utteranceCount = utteranceCount;
      existing.sourceDocumentCount = sourceDocumentCount;
      existing.sourceChecksum = sourceChecksum;
    }

    await em.flush();
  }

  private filterSourceContextByDayKeys(sourceContext: SourceContextDocument[], dayKeys: Set<string>): SourceContextDocument[] {
    if (dayKeys.size === 0) {
      return sourceContext;
    }

    const filtered = sourceContext.filter((document) => dayKeys.has(this.deriveDayKey(document.path)));
    return filtered.length > 0 ? filtered : sourceContext;
  }

  private buildSummaryArtifactOutputFromCache(daySummaries: SummaryArtifact[]): string {
    return daySummaries
      .filter((summary) => summary.channelGroup === canonicalChannelGroup && summary.summaryType === dailyFullSummaryType)
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((summary) => `## ${summary.day}\n\n${summary.summary}`)
      .join("\n\n");
  }

  private async buildSourceContextFromTranscriptDatabase(): Promise<SourceContextDocument[]> {
    const em = this.getEntityManager();
    const utterances = await em.find(TranscriptUtterance, {}, { orderBy: { timestamp: "asc", id: "asc" } });
    const groupedByDay = utterances.reduce<Map<string, TranscriptUtterance[]>>((grouped, utterance) => {
      const dayKey = dayjs(utterance.timestamp).utc().format("YYYY-MM-DD");
      const existing = grouped.get(dayKey) ?? [];
      existing.push(utterance);
      grouped.set(dayKey, existing);
      return grouped;
    }, new Map<string, TranscriptUtterance[]>());

    return [...groupedByDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, entries]) => {
        const content = entries
          .map((entry) =>
            [
              `[${dayjs(entry.timestamp).utc().toISOString()}]`,
              entry.channel.trim().length ? entry.channel.trim() : "UNKNOWN",
              entry.text.trim()
            ].join(" ")
          )
          .join("\n");
        const checksum = crypto.createHash("sha256").update(content).digest("hex");

        return {
          path: `${day}__channel-group-${canonicalChannelGroup}.txt`,
          checksum,
          content
        };
      });
  }

  async syncPromptDefinitions(): Promise<PromptDefinitionSyncResult> {
    const em = this.getEntityManager();
    const entries = await fs.readdir(this.config.promptsDir, { withFileTypes: true });
    const promptFiles = entries
      .filter((entry) => entry.isFile() && promptFilePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    const now = dayjs().utc().toDate();
    const changedPromptKeys = new Set<string>();

    for (const fileName of promptFiles) {
      const promptText = await fs.readFile(path.join(this.config.promptsDir, fileName), "utf8");
      const key = fileName.replace(/\.txt$/i, "");
      const existing = await em.findOne(PromptDefinition, { fileName });

      if (!existing) {
        const created = em.create(PromptDefinition, {
          key,
          fileName,
          content: promptText,
          updatedAt: now
        });
        em.persist(created);
        changedPromptKeys.add(key);
        continue;
      }

      if (existing.content !== promptText || existing.key !== key) {
        existing.content = promptText;
        existing.key = key;
        existing.updatedAt = now;
        changedPromptKeys.add(key);
      }
    }

    await em.flush();
    return {
      changedPrompts: changedPromptKeys.size,
      changedPromptKeys: [...changedPromptKeys].sort((left, right) => left.localeCompare(right))
    };
  }

  async runPipelineCycle(options?: { changedDayKeys?: Set<string>; sourceDocumentsChanged?: boolean }): Promise<void> {
    if (this.runInProgress) {
      return;
    }

    this.runInProgress = true;
    try {
      await this.markStaleRunningExecutionsAsFailed();
      const promptSyncResult = await this.syncPromptDefinitions();
      const sourceContext = await this.buildSourceContextFromTranscriptDatabase();
      const inferredChangedDayKeys = new Set(sourceContext.map((document) => this.deriveDayKey(document.path)));
      const changedDayKeys = options?.changedDayKeys ?? inferredChangedDayKeys;
      const sourceDocumentsChanged = options?.sourceDocumentsChanged ?? inferredChangedDayKeys.size > 0;
      await this.executePromptsSequentially({
        changedDayKeys,
        changedPromptKeys: new Set(promptSyncResult.changedPromptKeys),
        sourceDocumentsChanged,
        sourceContext
      });
      this.missionStatsCache = null;
    } finally {
      this.runInProgress = false;
    }
  }

  isPipelineRunInProgress(): boolean {
    return this.runInProgress;
  }

  private async markStaleRunningExecutionsAsFailed(): Promise<void> {
    const em = this.getEntityManager();
    const staleExecutions = await em.find(PromptExecution, { status: "running" });
    if (staleExecutions.length === 0) {
      return;
    }

    const failedAt = dayjs().utc().toDate();
    for (const execution of staleExecutions) {
      execution.status = "failed";
      execution.finishedAt = failedAt;
      execution.errorMessage = "Recovered after interrupted pipeline run before completion.";
    }

    await em.flush();
    serverLogger.warn("Recovered stale running prompt executions", {
      staleExecutionCount: staleExecutions.length
    });
  }

  async executePromptsSequentially(options?: {
    changedDayKeys?: Set<string>;
    changedPromptKeys?: Set<string>;
    sourceDocumentsChanged?: boolean;
    sourceContext?: SourceContextDocument[];
  }): Promise<void> {
    const em = this.getEntityManager();
    const allPrompts = await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    const prompts = this.buildPromptQueue(allPrompts);
    const sourceContext = options?.sourceContext ?? (await this.buildSourceContextFromTranscriptDatabase());
    const changedDayKeys = options?.changedDayKeys ?? new Set<string>();
    const changedPromptKeys = options?.changedPromptKeys ?? new Set<string>();
    const sourceDocumentsChanged = options?.sourceDocumentsChanged ?? true;
    let latestSummaryArtifactOutput: string | null = null;

    for (const prompt of prompts) {
      const promptChanged = changedPromptKeys.has(prompt.key);
      const shouldRunPrompt =
        prompt.key === "mission_summary"
          ? sourceDocumentsChanged || promptChanged || latestSummaryArtifactOutput !== null
          : sourceDocumentsChanged || promptChanged;
      if (!shouldRunPrompt) {
        continue;
      }

      const startedAt = dayjs().utc().toDate();
      const promptSourceContext =
        prompt.key === "daily_summary" && changedDayKeys.size > 0 && !promptChanged
          ? this.filterSourceContextByDayKeys(sourceContext, changedDayKeys)
          : sourceContext;
      if ((prompt.key === "daily_summary" || prompt.key === "notable_moments") && promptSourceContext.length === 0) {
        continue;
      }

      const submittedText = await this.buildPromptSubmission(prompt, promptSourceContext);
      if (prompt.key === "mission_summary" && !latestSummaryArtifactOutput) {
        const existingDailySummaries = await em.find(
          SummaryArtifact,
          { summaryType: dailyFullSummaryType, channelGroup: canonicalChannelGroup },
          { orderBy: { day: "asc" } }
        );
        latestSummaryArtifactOutput = this.buildSummaryArtifactOutputFromCache(existingDailySummaries);
      }
      const missionSubmittedText: string =
        prompt.key === "mission_summary" && latestSummaryArtifactOutput
          ? JSON.stringify(
              {
                generatedAt: dayjs().utc().toISOString(),
                strategy: "summaries-over-raw-docs",
                dailySummaryOutput: latestSummaryArtifactOutput
              },
              null,
              2
            )
          : submittedText;
      const execution: PromptExecution = em.create(PromptExecution, {
        prompt,
        componentId: prompt.key,
        cacheKey: "",
        cacheHit: false,
        startedAt,
        finishedAt: null,
        status: "running",
        submittedText: missionSubmittedText,
        output: "",
        errorMessage: null
      });
      em.persist(execution);
      await em.flush();
      const promptSubmissionPath = await this.persistPromptSubmission(prompt.key, missionSubmittedText);
      serverLogger.info("Prompt execution started", {
        promptKey: prompt.key,
        sourceDocumentCount: sourceContext.length,
        submissionPath: promptSubmissionPath
      });

      try {
        const output =
          prompt.key === "daily_summary"
            ? await this.generateSummaryArtifactOutput(prompt, promptSourceContext)
            : prompt.key === "notable_moments"
              ? await this.generateNotableMomentsOutput(prompt, promptSourceContext)
            : await this.config.llmClient.generateText({
                systemPrompt: prompt.content,
                userPrompt: missionSubmittedText,
                componentId: execution.componentId,
                requestId: `${execution.componentId}-${execution.id}`
              });

        execution.status = "success";
        execution.cacheHit = false;
        execution.output = output;
        execution.finishedAt = dayjs().utc().toDate();
        if (prompt.key === "daily_summary") {
          latestSummaryArtifactOutput = output;
          await this.persistSummaryArtifacts(output, promptSourceContext);
        }
        serverLogger.info("Prompt response received", {
          promptKey: prompt.key,
          componentId: execution.componentId,
          cacheHit: execution.cacheHit,
          status: execution.status,
          outputLength: output.length,
          outputPreview: this.createPreview(output, 220, 2)
        });
      } catch (error) {
        execution.status = "failed";
        execution.output = "";
        execution.errorMessage = error instanceof Error ? error.message : "Unknown error";
        execution.finishedAt = dayjs().utc().toDate();
        serverLogger.error("Prompt response failed", {
          promptKey: prompt.key,
          componentId: execution.componentId,
          errorMessage: execution.errorMessage
        });
      }

      await em.flush();
    }
  }

  async getDashboardView(): Promise<{ generatedAt: string; prompts: PromptDashboardEntry[] }> {
    const em = this.getEntityManager();
    const prompts = await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    const rows: PromptDashboardEntry[] = [];

    for (const prompt of prompts) {
      const latestExecution = await em.findOne(
        PromptExecution,
        { prompt: prompt.id },
        { orderBy: { startedAt: "desc" } }
      );

      rows.push({
        id: prompt.id,
        key: prompt.key,
        componentId: prompt.key,
        fileName: prompt.fileName,
        promptUpdatedAt: dayjs(prompt.updatedAt).utc().toISOString(),
        lastRunAt: latestExecution ? dayjs(latestExecution.startedAt).utc().toISOString() : null,
        status: latestExecution?.status ?? "never",
        cacheHit: latestExecution?.cacheHit ?? false,
        submittedPreview: latestExecution?.submittedText ? this.createPreview(latestExecution.submittedText, 180, 2) : null,
        outputPreview: latestExecution?.output ? this.createPreview(latestExecution.output, 180, 2) : null,
        submittedText: latestExecution?.submittedText ?? null,
        output: latestExecution?.status === "success" ? latestExecution.output : null,
        errorMessage: latestExecution?.status === "failed" ? latestExecution.errorMessage : null
      });
    }

    return {
      generatedAt: dayjs().utc().toISOString(),
      prompts: rows
    };
  }

  async runManualReingest(): Promise<{ changedDocuments: number }> {
    const sourceContext = await this.buildSourceContextFromTranscriptDatabase();
    serverLogger.info("Source documents reingested", {
      changedDocuments: sourceContext.length,
      changedDays: sourceContext.map((document) => this.deriveDayKey(document.path))
    });
    this.missionStatsCache = null;
    return { changedDocuments: sourceContext.length };
  }

  async getSummaries(filters?: {
    summaryType?: string;
    day?: string;
    channelGroup?: string;
  }): Promise<{ generatedAt: string; summaries: SummaryArtifactView[] }> {
    const em = this.getEntityManager();
    const where: Record<string, unknown> = {};
    if (filters?.summaryType) {
      where.summaryType = filters.summaryType;
    }
    if (filters?.day) {
      where.day = filters.day;
    }
    if (filters?.channelGroup) {
      where.channelGroup = filters.channelGroup;
    }

    const rows = await em.find(SummaryArtifact, where, { orderBy: { periodStart: "asc", channelGroup: "asc" } });
    return {
      generatedAt: dayjs().utc().toISOString(),
      summaries: rows.map((row) => ({
        id: row.id,
        summaryType: row.summaryType,
        day: row.day,
        periodStart: dayjs(row.periodStart).utc().toISOString(),
        periodEnd: dayjs(row.periodEnd).utc().toISOString(),
        channelGroup: row.channelGroup,
        summary: row.summary,
        generatedAt: dayjs(row.generatedAt).utc().toISOString(),
        updatedAt: dayjs(row.updatedAt).utc().toISOString(),
        wordCount: row.wordCount,
        utteranceCount: row.utteranceCount,
        sourceDocumentCount: row.sourceDocumentCount
      }))
    };
  }

  async getSummariesCatalog(): Promise<{
    generatedAt: string;
    entries: Array<{
      summaryType: string;
      day: string;
      channelGroup: string;
      periodStart: string;
      periodEnd: string;
      generatedAt: string;
      updatedAt: string;
    }>;
  }> {
    const em = this.getEntityManager();
    const rows = await em.find(SummaryArtifact, {}, { orderBy: { periodStart: "desc", channelGroup: "asc" } });
    return {
      generatedAt: dayjs().utc().toISOString(),
      entries: rows.map((row) => ({
        summaryType: row.summaryType,
        day: row.day,
        channelGroup: row.channelGroup,
        periodStart: dayjs(row.periodStart).utc().toISOString(),
        periodEnd: dayjs(row.periodEnd).utc().toISOString(),
        generatedAt: dayjs(row.generatedAt).utc().toISOString(),
        updatedAt: dayjs(row.updatedAt).utc().toISOString()
      }))
    };
  }

  async getMissionStatsView(): Promise<MissionStatsView> {
    const nowMs = Date.now();
    if (this.missionStatsCache && nowMs - this.missionStatsCache.computedAtMs < missionStatsCacheTtlMs) {
      return this.missionStatsCache.payload;
    }

    const em = this.getEntityManager();
    const [{ minTimestamp, maxTimestamp, utterances, words }] = await em.getConnection().execute<{
      minTimestamp: string | null;
      maxTimestamp: string | null;
      utterances: string;
      words: string;
    }[]>(
      `
        select
          min(timestamp) as "minTimestamp",
          max(timestamp) as "maxTimestamp",
          count(*)::text as "utterances",
          coalesce(sum(word_count), 0)::text as "words"
        from transcript_utterances
      `
    );

    const [{ dataDays }] = await em.getConnection().execute<{ dataDays: string }[]>(
      `
        select count(distinct date(timestamp at time zone 'utc'))::text as "dataDays"
        from transcript_utterances
      `
    );

    const utterancesPerHourRaw = await em.getConnection().execute<{ hour: string; utterances: string }[]>(
      `
        with bounds as (
          select
            date_trunc('hour', min(timestamp)) as min_hour,
            date_trunc('hour', max(timestamp)) as max_hour
          from transcript_utterances
        ),
        hours as (
          select generate_series(bounds.min_hour, bounds.max_hour, interval '1 hour') as hour
          from bounds
          where bounds.min_hour is not null and bounds.max_hour is not null
        ),
        grouped as (
          select date_trunc('hour', timestamp) as hour, count(*)::int as utterances
          from transcript_utterances
          group by 1
        )
        select
          to_char(hours.hour at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as hour,
          coalesce(grouped.utterances, 0)::text as utterances
        from hours
        left join grouped on grouped.hour = hours.hour
        order by hours.hour asc
      `
    );

    const payload: MissionStatsView = {
      generatedAt: dayjs().utc().toISOString(),
      range: {
        minTimestamp: minTimestamp ? dayjs(minTimestamp).utc().toISOString() : null,
        maxTimestamp: maxTimestamp ? dayjs(maxTimestamp).utc().toISOString() : null
      },
      totals: {
        dataDays: Number(dataDays ?? 0),
        utterances: Number(utterances ?? 0),
        lines: Number(utterances ?? 0),
        words: Number(words ?? 0)
      },
      utterancesPerHour: utterancesPerHourRaw.map((entry) => ({
        hour: entry.hour,
        utterances: Number(entry.utterances)
      }))
    };

    this.missionStatsCache = { computedAtMs: nowMs, payload };
    return payload;
  }
}
