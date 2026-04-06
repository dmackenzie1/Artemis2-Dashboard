import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../lib/dayjs.js";
import { PromptDefinition } from "../entities/PromptDefinition.js";
import { PromptExecution } from "../entities/PromptExecution.js";
import { SourceDocument } from "../entities/SourceDocument.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

type EntityManagerProvider = () => EntityManager;

type PipelineConfig = {
  sourceFilesDir: string;
  promptsDir: string;
  llmClient: LlmClient;
  promptSubmissionsDir: string;
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
const promptExecutionPriority = ["daily_summary", "notable_moments", "mission_summary"];
const skippedPromptKeys = new Set(["hourly_summary"]);
const dailySummaryTargetWords = {
  min: 5_000,
  max: 10_000
} as const;
const dailySummaryChunkCharacterLimit = 220_000;
const notableMomentsPerDay = 10;
const missionStatsCacheTtlMs = 5 * 60 * 1000;

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

  private createDailySummaryCacheSubmission(sourceContext: SourceContextDocument[]): string {
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
      return this.createDailySummaryCacheSubmission(sourceContext);
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
            targetMoments: notableMomentsPerDay
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

  private async generateDailySummaryOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
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
    const dayOutputs: string[] = [];
    serverLogger.info("Starting notable moments generation", {
      groupedDayCount: dayGroups.length,
      notableMomentsPerDay
    });

    for (const group of dayGroups) {
      const output = await this.config.llmClient.generateText({
        systemPrompt: prompt.content,
        userPrompt: JSON.stringify(
          {
            mode: "daily-notable-moments",
            day: group.day,
            targetMoments: notableMomentsPerDay,
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
        targetMomentsPerDay: notableMomentsPerDay,
        days: dayOutputs
      },
      null,
      2
    );
  }

  private buildPromptQueue(prompts: PromptDefinition[]): PromptDefinition[] {
    const indexByKey = new Map<string, number>(promptExecutionPriority.map((key, index) => [key, index]));

    return prompts
      .filter((prompt) => !skippedPromptKeys.has(prompt.key))
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

  async syncSourceDocuments(): Promise<number> {
    const em = this.getEntityManager();
    const entries = await fs.readdir(this.config.sourceFilesDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    const now = dayjs().utc().toDate();
    let changedCount = 0;

    for (const fileName of files) {
      const relativePath = fileName;
      const fullPath = path.join(this.config.sourceFilesDir, fileName);
      const stat = await fs.stat(fullPath);
      const content = await fs.readFile(fullPath, "utf8");
      const checksum = crypto.createHash("sha256").update(content).digest("hex");
      const existing = await em.findOne(SourceDocument, { relativePath });

      if (!existing) {
        const created = em.create(SourceDocument, {
          relativePath,
          checksum,
          content,
          fileModifiedAt: stat.mtime,
          ingestedAt: now
        });

        em.persist(created);
        changedCount += 1;
        continue;
      }

      if (existing.checksum !== checksum || existing.fileModifiedAt.getTime() !== stat.mtime.getTime()) {
        existing.checksum = checksum;
        existing.content = content;
        existing.fileModifiedAt = stat.mtime;
        existing.ingestedAt = now;
        changedCount += 1;
      }
    }

    await em.flush();
    return changedCount;
  }

  async syncPromptDefinitions(): Promise<void> {
    const em = this.getEntityManager();
    const entries = await fs.readdir(this.config.promptsDir, { withFileTypes: true });
    const promptFiles = entries
      .filter((entry) => entry.isFile() && promptFilePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    const now = dayjs().utc().toDate();

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
        continue;
      }

      if (existing.content !== promptText || existing.key !== key) {
        existing.content = promptText;
        existing.key = key;
        existing.updatedAt = now;
      }
    }

    await em.flush();
  }

  async runPipelineCycle(): Promise<void> {
    if (this.runInProgress) {
      return;
    }

    this.runInProgress = true;
    try {
      await this.markStaleRunningExecutionsAsFailed();
      await this.syncSourceDocuments();
      await this.syncPromptDefinitions();
      await this.executePromptsSequentially();
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

  async executePromptsSequentially(): Promise<void> {
    const em = this.getEntityManager();
    const allPrompts = await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    const prompts = this.buildPromptQueue(allPrompts);
    const sourceDocs = await em.find(SourceDocument, {}, { orderBy: { relativePath: "asc" } });

    const sourceContext: SourceContextDocument[] = sourceDocs.map((doc) => ({
      path: doc.relativePath,
      checksum: doc.checksum,
      content: doc.content
    }));
    let latestDailySummaryOutput: string | null = null;

    for (const prompt of prompts) {
      const startedAt = dayjs().utc().toDate();
      const submittedText = await this.buildPromptSubmission(prompt, sourceContext);
      const missionSubmittedText: string =
        prompt.key === "mission_summary" && latestDailySummaryOutput
          ? JSON.stringify(
              {
                generatedAt: dayjs().utc().toISOString(),
                strategy: "summaries-over-raw-docs",
                dailySummaryOutput: latestDailySummaryOutput
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
            ? await this.generateDailySummaryOutput(prompt, sourceContext)
            : prompt.key === "notable_moments"
              ? await this.generateNotableMomentsOutput(prompt, sourceContext)
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
          latestDailySummaryOutput = output;
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
    const changedDocuments = await this.syncSourceDocuments();
    serverLogger.info("Source documents reingested", { changedDocuments });
    this.missionStatsCache = null;
    return { changedDocuments };
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
