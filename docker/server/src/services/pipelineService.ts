import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../lib/dayjs.js";
import { PromptDefinition } from "../entities/PromptDefinition.js";
import { PromptExecution } from "../entities/PromptExecution.js";
import { SummaryArtifact } from "../entities/SummaryArtifact.js";
import { IngestionSourceFile } from "../entities/IngestionSourceFile.js";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { liveUpdateBus } from "./liveUpdateBus.js";
import { TranscriptContextBuilder } from "./pipeline/TranscriptContextBuilder.js";
import { createSummaryPromptGenerators } from "./pipeline/summaryGenerators.js";
import type { SourceContextDocument } from "./pipeline/pipelineTypes.js";

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
const missionStatsCacheTtlMs = 5 * 60 * 1000;
const canonicalChannelGroup = "*";
const dailyFullSummaryType = "daily_full";


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

type PromptMatrixCellState = "none" | "sent" | "received" | "error";

type PromptMatrixCell = {
  day: string;
  state: PromptMatrixCellState;
  sentAt: string | null;
  receivedAt: string | null;
  responseDay: string | null;
  executionId: number | null;
  errorMessage: string | null;
};

type PromptMatrixRow = {
  key: string;
  componentId: string;
  cells: PromptMatrixCell[];
};

export class PipelineService {
  private runInProgress = false;
  private missionStatsCache: { computedAtMs: number; payload: MissionStatsView } | null = null;
  private readonly transcriptContextBuilder: TranscriptContextBuilder;
  private readonly summaryGenerators: ReturnType<typeof createSummaryPromptGenerators>;

  constructor(
    private readonly getEntityManager: EntityManagerProvider,
    private readonly config: PipelineConfig
  ) {
    this.transcriptContextBuilder = new TranscriptContextBuilder();
    this.summaryGenerators = createSummaryPromptGenerators({
      llmClient: this.config.llmClient,
      getEntityManager: this.getEntityManager,
      transcriptContextBuilder: this.transcriptContextBuilder,
      notableMomentsConfig: this.config.notableMoments
    });
  }

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

  private mapPromptExecutionStatusToMatrixState(status: PromptExecution["status"]): PromptMatrixCellState {
    if (status === "success") {
      return "received";
    }
    if (status === "failed") {
      return "error";
    }
    return "sent";
  }

  private async listTranscriptDays(limit: number): Promise<string[]> {
    const em = this.getEntityManager();
    try {
      const rows = (await em.getConnection().execute(
        `
          select to_char((timestamp at time zone 'UTC')::date, 'YYYY-MM-DD') as day
          from transcript_utterances
          group by 1
          order by 1 desc
          limit ?
        `,
        [limit]
      )) as Array<{ day?: unknown }>;
      return rows
        .map((row) => (typeof row.day === "string" ? row.day : null))
        .filter((dayKey): dayKey is string => Boolean(dayKey));
    } catch (_error) {
      return [];
    }
  }

  private derivePromptResponseDay(sourceContext: SourceContextDocument[]): string | null {
    return this.transcriptContextBuilder.derivePromptResponseDay(sourceContext);
  }

  private async getLatestIngestAt(): Promise<string | null> {
    const em = this.getEntityManager();
    const latestSourceFile = await em.findOne(IngestionSourceFile, {}, { orderBy: { updatedAt: "desc" } });
    if (!latestSourceFile) {
      return null;
    }

    return dayjs(latestSourceFile.updatedAt).utc().toISOString();
  }

  private async buildPromptSubmission(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    if (prompt.key === "daily_summary") {
      return this.transcriptContextBuilder.buildDailySummarySubmission(sourceContext);
    }

    if (prompt.key === "recent_changes") {
      return this.transcriptContextBuilder.buildRecentChangesSubmission(sourceContext);
    }

    if (prompt.key === "notable_moments") {
      return this.transcriptContextBuilder.buildNotableMomentsSubmission(
        sourceContext,
        this.config.notableMoments.baselinePerDay
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

  private async generateSummaryArtifactOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const generator = this.summaryGenerators.get("daily_summary");
    if (!generator) {
      throw new Error("Daily summary generator is not configured.");
    }
    return generator.generateOutput(prompt, sourceContext);
  }

  private async generateNotableMomentsOutput(prompt: PromptDefinition, sourceContext: SourceContextDocument[]): Promise<string> {
    const generator = this.summaryGenerators.get("notable_moments");
    if (!generator) {
      throw new Error("Notable moments generator is not configured.");
    }
    return generator.generateOutput(prompt, sourceContext);
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
    const dayGroupsByDay = new Map(this.transcriptContextBuilder.buildDailyGroups(sourceContext).map((group) => [group.day, group]));
    const parsedSections = this.parseSummaryArtifactSections(output);
    if (parsedSections.length === 0) {
      return;
    }

    const generatedAt = dayjs().utc().toDate();

    // Pre-fetch all existing SummaryArtifact rows that overlap with any of the
    // parsed sections in a single query, then match by periodStart in memory.
    // This replaces the previous per-section findOne inside the loop (N+1).
    const periodStarts = parsedSections.map((section) => dayjs(`${section.day}T00:00:00Z`).utc().toDate());
    const existingArtifacts = await em.find(SummaryArtifact, {
      summaryType: dailyFullSummaryType,
      channelGroup: canonicalChannelGroup,
      periodStart: { $in: periodStarts }
    });
    const existingByPeriodStart = new Map(
      existingArtifacts.map((artifact) => [artifact.periodStart.getTime(), artifact])
    );

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
      const existing = existingByPeriodStart.get(periodStart.getTime()) ?? null;

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
    return this.transcriptContextBuilder.filterSourceContextByDayKeys(sourceContext, dayKeys);
  }

  private buildSummaryArtifactOutputFromCache(daySummaries: SummaryArtifact[]): string {
    return daySummaries
      .filter((summary) => summary.channelGroup === canonicalChannelGroup && summary.summaryType === dailyFullSummaryType)
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((summary) => `## ${summary.day}\n\n${summary.summary}`)
      .join("\n\n");
  }

  private async buildSourceContextFromTranscriptDatabase(dayKeys?: Set<string>): Promise<SourceContextDocument[]> {
    const em = this.getEntityManager();
    // When a specific set of changed day keys is provided, scope the query to
    // only those days so we avoid a full table scan on large corpora. Fall back
    // to a full load when dayKeys is absent or empty (e.g. first run, manual
    // ingest with no change tracking, or mission_summary which needs all days).
    const where =
      dayKeys && dayKeys.size > 0
        ? {
            $and: [
              { timestamp: { $gte: dayjs(Math.min(...[...dayKeys].map((d) => new Date(d).getTime()))).utc().startOf("day").toDate() } },
              { timestamp: { $lte: dayjs(Math.max(...[...dayKeys].map((d) => new Date(d).getTime()))).utc().endOf("day").toDate() } }
            ]
          }
        : {};
    const utterances = await em.find(TranscriptUtterance, where, { orderBy: { timestamp: "asc", id: "asc" } });
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
      const inferredChangedDayKeys = new Set(sourceContext.map((document) => this.transcriptContextBuilder.deriveDayKey(document.path)));
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
      execution.receivedAt = failedAt;
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
    const changedDayKeys = options?.changedDayKeys ?? new Set<string>();
    const changedPromptKeys = options?.changedPromptKeys ?? new Set<string>();
    const sourceDocumentsChanged = options?.sourceDocumentsChanged ?? true;
    // When source context is not provided externally, build it from the DB.
    // Pass changedDayKeys so the query is scoped to only the affected days
    // rather than scanning every row in the table.
    const sourceContext = options?.sourceContext ?? (await this.buildSourceContextFromTranscriptDatabase(changedDayKeys));
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
      const responseDay = this.derivePromptResponseDay(promptSourceContext);
      const execution: PromptExecution = em.create(PromptExecution, {
        prompt,
        componentId: prompt.key,
        cacheKey: "",
        cacheHit: false,
        responseDay,
        startedAt,
        sentAt: startedAt,
        receivedAt: null,
        finishedAt: null,
        status: "running",
        submittedText: missionSubmittedText,
        output: "",
        errorMessage: null
      });
      em.persist(execution);
      await em.flush();
      const promptSubmissionPath = await this.persistPromptSubmission(prompt.key, missionSubmittedText);
      liveUpdateBus.publish({
        type: "prompt.sent",
        payload: {
          executionId: execution.id,
          promptKey: prompt.key,
          componentId: execution.componentId,
          day: execution.responseDay ?? dayjs(execution.startedAt).utc().format("YYYY-MM-DD"),
          sentAt: dayjs(execution.sentAt).utc().toISOString()
        }
      });
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
        execution.receivedAt = execution.finishedAt;
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
        liveUpdateBus.publish({
          type: "prompt.received",
          payload: {
            executionId: execution.id,
            promptKey: prompt.key,
            componentId: execution.componentId,
            day: execution.responseDay ?? dayjs(execution.startedAt).utc().format("YYYY-MM-DD"),
            sentAt: dayjs(execution.sentAt).utc().toISOString(),
            receivedAt: dayjs(execution.receivedAt).utc().toISOString()
          }
        });
      } catch (error) {
        execution.status = "failed";
        execution.output = "";
        execution.errorMessage = error instanceof Error ? error.message : "Unknown error";
        execution.finishedAt = dayjs().utc().toDate();
        execution.receivedAt = execution.finishedAt;
        serverLogger.error("Prompt response failed", {
          promptKey: prompt.key,
          componentId: execution.componentId,
          errorMessage: execution.errorMessage
        });
        liveUpdateBus.publish({
          type: "prompt.error",
          payload: {
            executionId: execution.id,
            promptKey: prompt.key,
            componentId: execution.componentId,
            day: execution.responseDay ?? dayjs(execution.startedAt).utc().format("YYYY-MM-DD"),
            sentAt: dayjs(execution.sentAt).utc().toISOString(),
            receivedAt: dayjs(execution.receivedAt).utc().toISOString(),
            errorMessage: execution.errorMessage
          }
        });
      }

      await em.flush();
    }
  }

  async getDashboardView(): Promise<{ generatedAt: string; prompts: PromptDashboardEntry[] }> {
    const em = this.getEntityManager();
    const prompts = await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });

    // Fetch all executions for every known prompt in a single query, ordered
    // newest-first so we can cheaply pick the latest per prompt below.
    const promptIds = prompts.map((p) => p.id);
    const allExecutions =
      promptIds.length > 0
        ? await em.find(
            PromptExecution,
            { prompt: { $in: promptIds } },
            { orderBy: { startedAt: "desc", id: "desc" } }
          )
        : [];

    // Build a lookup map: promptId → most-recent PromptExecution.
    // Because allExecutions is already ordered newest-first, the first entry
    // encountered for each prompt id is definitionally the latest one.
    const latestByPromptId = new Map<number, PromptExecution>();
    for (const execution of allExecutions) {
      const promptId = execution.prompt.id;
      if (!latestByPromptId.has(promptId)) {
        latestByPromptId.set(promptId, execution);
      }
    }

    const rows: PromptDashboardEntry[] = prompts.map((prompt) => {
      const latestExecution = latestByPromptId.get(prompt.id) ?? null;
      return {
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
      };
    });

    return {
      generatedAt: dayjs().utc().toISOString(),
      prompts: rows
    };
  }

  async getPromptDashboardEntryByKey(promptKey: string): Promise<PromptDashboardEntry | null> {
    const em = this.getEntityManager();
    const prompt = await em.findOne(PromptDefinition, { key: promptKey });
    if (!prompt) {
      return null;
    }

    const latestExecution = await em.findOne(
      PromptExecution,
      { prompt: prompt.id },
      { orderBy: { startedAt: "desc", id: "desc" } }
    );

    return {
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
    };
  }

  async getPromptMatrixState(daysLimit = 11): Promise<{
    generatedAt: string;
    latestIngestAt: string | null;
    days: string[];
    prompts: PromptMatrixRow[];
  }> {
    const em = this.getEntityManager();
    const safeDaysLimit = Math.max(1, Math.min(Math.trunc(daysLimit), 20));
    const prompts = await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    // Scope the execution query to the window we actually need instead of
    // loading up to 10 000 rows unconditionally and discarding old ones later.
    const cutoffDate = dayjs().utc().subtract(safeDaysLimit, "day").startOf("day").toDate();
    const executions = (await em.getConnection().execute(
      `
        select
          pe.id,
          pd.key as "promptKey",
          pe.status,
          pe.response_day as "responseDay",
          pe.started_at as "startedAt",
          pe.sent_at as "sentAt",
          pe.received_at as "receivedAt",
          pe.error_message as "errorMessage"
        from prompt_executions pe
        inner join prompt_definitions pd on pd.id = pe.prompt_id
        where pe.started_at >= ?
        order by pe.started_at desc, pe.id desc
      `,
      [cutoffDate]
    )) as Array<{
      id: number;
      promptKey: string;
      status: PromptExecution["status"];
      responseDay: string | null;
      startedAt: string | Date;
      sentAt: string | Date | null;
      receivedAt: string | Date | null;
      errorMessage: string | null;
    }>;
    const latestIngestAt = await this.getLatestIngestAt();
    const transcriptDays = await this.listTranscriptDays(safeDaysLimit);
    const executionDays = executions.map((execution) => execution.responseDay ?? dayjs(execution.sentAt ?? execution.startedAt).utc().format("YYYY-MM-DD"));
    const dayKeys = Array.from(new Set([...transcriptDays, ...executionDays]))
      .sort((left, right) => left.localeCompare(right))
      .slice(-safeDaysLimit);

    const rowMap = new Map<string, PromptMatrixRow>();
    for (const prompt of prompts) {
      rowMap.set(prompt.key, {
        key: prompt.key,
        componentId: prompt.key,
        cells: dayKeys.map((day) => ({
          day,
          state: "none",
          sentAt: null,
          receivedAt: null,
          responseDay: null,
          executionId: null,
          errorMessage: null
        }))
      });
    }

    for (const execution of executions) {
      const promptKey = execution.promptKey;
      const row = rowMap.get(promptKey);
      if (!row) {
        continue;
      }
      const day = execution.responseDay ?? dayjs(execution.sentAt ?? execution.startedAt).utc().format("YYYY-MM-DD");
      const cell = row.cells.find((entry) => entry.day === day);
      if (!cell || cell.executionId !== null) {
        continue;
      }

      cell.state = this.mapPromptExecutionStatusToMatrixState(execution.status);
      cell.sentAt = dayjs(execution.sentAt ?? execution.startedAt).utc().toISOString();
      cell.receivedAt = execution.receivedAt ? dayjs(execution.receivedAt).utc().toISOString() : null;
      cell.responseDay = execution.responseDay ?? null;
      cell.executionId = execution.id;
      cell.errorMessage = execution.status === "failed" ? execution.errorMessage : null;
    }

    return {
      generatedAt: dayjs().utc().toISOString(),
      latestIngestAt,
      days: dayKeys,
      prompts: prompts
        .map((prompt) => rowMap.get(prompt.key))
        .filter((row): row is PromptMatrixRow => Boolean(row))
    };
  }

  async runManualReingest(): Promise<{ changedDocuments: number }> {
    const sourceContext = await this.buildSourceContextFromTranscriptDatabase();
    serverLogger.info("Source documents reingested", {
      changedDocuments: sourceContext.length,
      changedDays: sourceContext.map((document) => this.transcriptContextBuilder.deriveDayKey(document.path))
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
    // Run all three read-only aggregate queries concurrently — they are fully
    // independent and each requires its own full scan, so parallelism cuts the
    // wall-clock time roughly by 3×.
    const [aggregateRows, dataDaysRows, utterancesPerHourRaw] = await Promise.all([
      em.getConnection().execute<{
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
      ),
      em.getConnection().execute<{ dataDays: string }[]>(
        `
          select count(distinct date(timestamp at time zone 'utc'))::text as "dataDays"
          from transcript_utterances
        `
      ),
      em.getConnection().execute<{ hour: string; utterances: string }[]>(
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
      )
    ]);

    const [{ minTimestamp, maxTimestamp, utterances, words }] = aggregateRows;
    const [{ dataDays }] = dataDaysRows;

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
