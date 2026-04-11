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
import { canonicalPromptKey, promptExecutionPriority, runnablePromptKeys, systemStatusPromptKeys } from "./pipeline/promptCatalog.js";
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
  fileName: string;
  promptUpdatedAt: string;
  lastRunAt: string | null;
  status: "running" | "success" | "failed" | "never";
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
const missionStatsCacheTtlMs = 5 * 60 * 1000;
const canonicalChannelGroup = "*";
const dailyFullSummaryType = "daily_full";


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
  cells: PromptMatrixCell[];
};

type PromptMatrixExecutionRecord = {
  id: number;
  promptKey: string;
  status: PromptExecution["status"];
  responseDay: string | null;
  startedAt: string | Date;
  sentAt: string | Date | null;
  receivedAt: string | Date | null;
  errorMessage: string | null;
  submittedText: string | null;
};

export class PipelineService {
  private runInProgress = false;
  private missionStatsCache: { computedAtMs: number; payload: MissionStatsView } | null = null;
  private readonly transcriptContextBuilder: TranscriptContextBuilder;

  constructor(
    private readonly getEntityManager: EntityManagerProvider,
    private readonly config: PipelineConfig
  ) {
    this.transcriptContextBuilder = new TranscriptContextBuilder();
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

  private derivePromptMatrixExecutionDays(
    execution: PromptMatrixExecutionRecord,
    cutoffDayString: string
  ): string[] {
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
    const normalizedDays: string[] = [];
    const appendDay = (candidate: string | null | undefined): void => {
      if (!candidate || !isoDatePattern.test(candidate) || candidate < cutoffDayString || normalizedDays.includes(candidate)) {
        return;
      }
      normalizedDays.push(candidate);
    };

    appendDay(execution.responseDay);

    if (normalizedDays.length === 0 && execution.submittedText) {
      try {
        const parsed = JSON.parse(execution.submittedText) as { dayGroups?: Array<{ day?: unknown }> };
        if (Array.isArray(parsed.dayGroups)) {
          for (const group of parsed.dayGroups) {
            appendDay(typeof group?.day === "string" ? group.day : null);
          }
        }
      } catch (_error) {
        // Ignore malformed historical payloads and fall through to timestamp-derived day.
      }
    }

    if (normalizedDays.length === 0) {
      appendDay(dayjs(execution.sentAt ?? execution.startedAt).utc().format("YYYY-MM-DD"));
    }

    return normalizedDays;
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

  private async getLatestIngestAt(): Promise<string | null> {
    const em = this.getEntityManager();
    const [latestSourceFile] = await em.find(IngestionSourceFile, {}, { orderBy: { updatedAt: "desc" }, limit: 1 });
    if (!latestSourceFile) {
      return null;
    }

    return dayjs(latestSourceFile.updatedAt).utc().toISOString();
  }


  private buildPromptQueue(prompts: PromptDefinition[]): PromptDefinition[] {
    const indexByKey = new Map<string, number>(promptExecutionPriority.map((key, index) => [key, index]));

    return prompts
      .filter((prompt) => runnablePromptKeys.has(prompt.key))
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

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }
    return trimmed.split(/\s+/u).length;
  }

  private async persistSingleDaySummaryArtifact(
    day: string,
    summary: string,
    sourceDocuments: SourceContextDocument[]
  ): Promise<void> {
    const em = this.getEntityManager();
    const periodStart = dayjs(`${day}T00:00:00Z`).utc().toDate();
    const periodEnd = dayjs(`${day}T23:59:59.999Z`).utc().toDate();
    const generatedAt = dayjs().utc().toDate();
    const utteranceCount = sourceDocuments.reduce((total, document) => total + this.countNonEmptyLines(document.content), 0);
    const sourceChecksum = crypto
      .createHash("sha256")
      .update(sourceDocuments.map((document) => `${document.path}:${document.checksum}`).join("|"))
      .digest("hex");
    const existing = await em.findOne(SummaryArtifact, {
      summaryType: dailyFullSummaryType,
      channelGroup: canonicalChannelGroup,
      periodStart
    });

    if (!existing) {
      em.persist(
        em.create(SummaryArtifact, {
          summaryType: dailyFullSummaryType,
          day,
          periodStart,
          periodEnd,
          channelGroup: canonicalChannelGroup,
          summary,
          generatedAt,
          updatedAt: generatedAt,
          wordCount: this.countWords(summary),
          utteranceCount,
          sourceDocumentCount: sourceDocuments.length,
          sourceChecksum
        })
      );
      await em.flush();
      return;
    }

    existing.summary = summary;
    existing.day = day;
    existing.periodEnd = periodEnd;
    existing.generatedAt = generatedAt;
    existing.updatedAt = generatedAt;
    existing.wordCount = this.countWords(summary);
    existing.utteranceCount = utteranceCount;
    existing.sourceDocumentCount = sourceDocuments.length;
    existing.sourceChecksum = sourceChecksum;
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
    const entries = await fs
      .readdir(this.config.promptsDir, { withFileTypes: true })
      .catch((error: NodeJS.ErrnoException) => {
        if (error?.code === "ENOENT") {
          serverLogger.warn("Prompt definitions directory not found during sync", {
            promptsDir: this.config.promptsDir
          });
          return [];
        }
        throw error;
      });
    const promptFiles = entries
      .filter((entry) => entry.isFile() && promptFilePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    const now = dayjs().utc().toDate();
    const changedPromptKeys = new Set<string>();

    for (const fileName of promptFiles) {
      const promptText = await fs.readFile(path.join(this.config.promptsDir, fileName), "utf8");
      const rawKey = fileName.replace(/\.txt$/i, "");
      const key = canonicalPromptKey(rawKey);
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

    const flush = (em as { flush?: () => Promise<void> }).flush;
    if (typeof flush === "function") {
      await flush.call(em);
    }
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
    const promptByKey = new Map(prompts.map((prompt) => [prompt.key, prompt]));
    const changedDayKeys = options?.changedDayKeys ?? new Set<string>();
    const changedPromptKeys = options?.changedPromptKeys ?? new Set<string>();
    const sourceDocumentsChanged = options?.sourceDocumentsChanged ?? true;
    const sourceContext = options?.sourceContext ?? (await this.buildSourceContextFromTranscriptDatabase(changedDayKeys));
    const dayGroups = this.transcriptContextBuilder.buildDailyGroups(sourceContext);
    const runDays = dayGroups
      .map((group) => group.day)
      .filter((day) => changedDayKeys.size === 0 || changedDayKeys.has(day))
      .sort((left, right) => left.localeCompare(right));
    const dayDocumentsByKey = new Map(
      dayGroups.map((group) => [group.day, this.filterSourceContextByDayKeys(sourceContext, new Set([group.day]))])
    );
    const notableDayOutputs: Array<{ day: string; output: string }> = [];

    const runPromptExecution = async (params: {
      prompt: PromptDefinition;
      responseDay: string | null;
      submittedText: string;
      sourceDocumentCount: number;
      outputFactory: (execution: PromptExecution) => Promise<string>;
    }): Promise<string | null> => {
      const startedAt = dayjs().utc().toDate();
      const execution: PromptExecution = em.create(PromptExecution, {
        prompt: params.prompt,
        responseDay: params.responseDay,
        startedAt,
        sentAt: startedAt,
        receivedAt: null,
        status: "running",
        submittedText: params.submittedText,
        output: "",
        errorMessage: null
      });
      em.persist(execution);
      await em.flush();
      const promptSubmissionPath = await this.persistPromptSubmission(params.prompt.key, params.submittedText);
      liveUpdateBus.publish({
        type: "prompt.sent",
        payload: {
          executionId: execution.id,
          promptKey: params.prompt.key,
          day: execution.responseDay ?? dayjs(execution.startedAt).utc().format("YYYY-MM-DD"),
          sentAt: dayjs(execution.sentAt).utc().toISOString()
        }
      });
      serverLogger.info("Prompt execution started", {
        promptKey: params.prompt.key,
        responseDay: params.responseDay,
        sourceDocumentCount: params.sourceDocumentCount,
        submissionPath: promptSubmissionPath
      });

      try {
        const output = await params.outputFactory(execution);
        execution.status = "success";
        execution.output = output;
        execution.receivedAt = dayjs().utc().toDate();
        liveUpdateBus.publish({
          type: "prompt.received",
          payload: {
            executionId: execution.id,
            promptKey: params.prompt.key,
            day: execution.responseDay ?? dayjs(execution.startedAt).utc().format("YYYY-MM-DD"),
            sentAt: dayjs(execution.sentAt).utc().toISOString(),
            receivedAt: dayjs(execution.receivedAt).utc().toISOString()
          }
        });
        await em.flush();
        return output;
      } catch (error) {
        execution.status = "failed";
        execution.output = "";
        execution.errorMessage = error instanceof Error ? error.message : "Unknown error";
        execution.receivedAt = dayjs().utc().toDate();
        liveUpdateBus.publish({
          type: "prompt.error",
          payload: {
            executionId: execution.id,
            promptKey: params.prompt.key,
            day: execution.responseDay ?? dayjs(execution.startedAt).utc().format("YYYY-MM-DD"),
            sentAt: dayjs(execution.sentAt).utc().toISOString(),
            receivedAt: dayjs(execution.receivedAt).utc().toISOString(),
            errorMessage: execution.errorMessage
          }
        });
        await em.flush();
        return null;
      }
    };

    const shouldRunDayStage = (promptKey: string): boolean => {
      return sourceDocumentsChanged || changedPromptKeys.has(promptKey);
    };

    for (const day of runDays) {
      const dayDocuments = dayDocumentsByKey.get(day) ?? [];
      if (dayDocuments.length === 0) {
        continue;
      }
      const daySourceDocuments = dayDocuments.map((document) => ({ path: document.path, content: document.content }));
      let amSummary: string | null = null;
      let pmSummary: string | null = null;
      let dailySummary: string | null = null;

      const amPrompt = promptByKey.get("daily_summary_am");
      if (amPrompt && shouldRunDayStage(amPrompt.key)) {
        const submittedText = JSON.stringify(
          {
            mode: "daily-half-day-synthesis",
            day,
            segment: "AM (00:00-11:59 UTC)",
            sourceDocuments: daySourceDocuments
          },
          null,
          2
        );
        amSummary = await runPromptExecution({
          prompt: amPrompt,
          responseDay: day,
          submittedText,
          sourceDocumentCount: dayDocuments.length,
          outputFactory: (execution) =>
            this.config.llmClient.generateText({
              systemPrompt: amPrompt.content,
              userPrompt: submittedText,
              componentId: `${amPrompt.key}:${day}`
            })
        });
      }

      const pmPrompt = promptByKey.get("daily_summary_pm");
      if (pmPrompt && shouldRunDayStage(pmPrompt.key)) {
        const submittedText = JSON.stringify(
          {
            mode: "daily-half-day-synthesis",
            day,
            segment: "PM (12:00-23:59 UTC)",
            sourceDocuments: daySourceDocuments
          },
          null,
          2
        );
        pmSummary = await runPromptExecution({
          prompt: pmPrompt,
          responseDay: day,
          submittedText,
          sourceDocumentCount: dayDocuments.length,
          outputFactory: (execution) =>
            this.config.llmClient.generateText({
              systemPrompt: pmPrompt.content,
              userPrompt: submittedText,
              componentId: `${pmPrompt.key}:${day}`
            })
        });
      }

      const dailyPrompt = promptByKey.get("daily_summary");
      if (dailyPrompt && shouldRunDayStage(dailyPrompt.key) && amSummary && pmSummary) {
        const submittedText = JSON.stringify(
          {
            mode: "daily-final-from-half-day",
            day,
            amSummary,
            pmSummary,
            sourceDocuments: daySourceDocuments
          },
          null,
          2
        );
        dailySummary = await runPromptExecution({
          prompt: dailyPrompt,
          responseDay: day,
          submittedText,
          sourceDocumentCount: dayDocuments.length,
          outputFactory: (execution) =>
            this.config.llmClient.generateText({
              systemPrompt: dailyPrompt.content,
              userPrompt: submittedText,
              componentId: `${dailyPrompt.key}:${day}:final`
            })
        });
        if (dailySummary) {
          await this.persistSingleDaySummaryArtifact(day, dailySummary, dayDocuments);
        }
      }

      const notablePrompt = promptByKey.get("notable_moments");
      if (notablePrompt && shouldRunDayStage(notablePrompt.key)) {
        const submittedText = JSON.stringify(
          {
            mode: "daily-notable-moments",
            day,
            targetMoments: this.config.notableMoments.baselinePerDay,
            dailySummary,
            sourceDocuments: daySourceDocuments
          },
          null,
          2
        );
        const notableOutput = await runPromptExecution({
          prompt: notablePrompt,
          responseDay: day,
          submittedText,
          sourceDocumentCount: dayDocuments.length,
          outputFactory: (execution) =>
            this.config.llmClient.generateText({
              systemPrompt: notablePrompt.content,
              userPrompt: submittedText,
              componentId: `${notablePrompt.key}:${day}`,
              requestId: `${notablePrompt.key}-${execution.id}`
            })
        });
        if (notableOutput) {
          notableDayOutputs.push({ day, output: notableOutput });
        }
      }
    }

    const missionPrompt = promptByKey.get("mission_summary");
    if (missionPrompt && (sourceDocumentsChanged || changedPromptKeys.has(missionPrompt.key))) {
      const existingDailySummaries = await em.find(
        SummaryArtifact,
        { summaryType: dailyFullSummaryType, channelGroup: canonicalChannelGroup },
        { orderBy: { day: "asc" } }
      );
      const dailySummaryOutput = this.buildSummaryArtifactOutputFromCache(existingDailySummaries);
      const submittedText = JSON.stringify(
        {
          generatedAt: dayjs().utc().toISOString(),
          strategy: "summaries-over-raw-docs",
          partialDayRun: true,
          dailySummaryOutput,
          notableMoments: notableDayOutputs
        },
        null,
        2
      );

      await runPromptExecution({
        prompt: missionPrompt,
        responseDay: null,
        submittedText,
        sourceDocumentCount: sourceContext.length,
        outputFactory: (execution) =>
          this.config.llmClient.generateText({
            systemPrompt: missionPrompt.content,
            userPrompt: submittedText,
            componentId: missionPrompt.key,
            requestId: `${missionPrompt.key}-${execution.id}`
          })
      });
    }
  }

  async getDashboardView(): Promise<{ generatedAt: string; prompts: PromptDashboardEntry[] }> {
    await this.syncPromptDefinitions();
    const em = this.getEntityManager();
    const prompts = (await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } }))
      .filter((prompt) => systemStatusPromptKeys.has(prompt.key));

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
        fileName: prompt.fileName,
        promptUpdatedAt: dayjs(prompt.updatedAt).utc().toISOString(),
        lastRunAt: latestExecution ? dayjs(latestExecution.startedAt).utc().toISOString() : null,
        status: latestExecution?.status ?? "never",
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
    await this.syncPromptDefinitions();
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
      fileName: prompt.fileName,
      promptUpdatedAt: dayjs(prompt.updatedAt).utc().toISOString(),
      lastRunAt: latestExecution ? dayjs(latestExecution.startedAt).utc().toISOString() : null,
      status: latestExecution?.status ?? "never",
      submittedPreview: latestExecution?.submittedText ? this.createPreview(latestExecution.submittedText, 180, 2) : null,
      outputPreview: latestExecution?.output ? this.createPreview(latestExecution.output, 180, 2) : null,
      submittedText: latestExecution?.submittedText ?? null,
      output: latestExecution?.status === "success" ? latestExecution.output : null,
      errorMessage: latestExecution?.status === "failed" ? latestExecution.errorMessage : null
    };
  }

  async getLatestPromptExecutionsByDay(promptKey: string, daysLimit = 20): Promise<PromptExecution[]> {
    const em = this.getEntityManager();
    const prompt = await em.findOne(PromptDefinition, { key: promptKey });
    if (!prompt) {
      return [];
    }

    const executions = await em.find(
      PromptExecution,
      { prompt: prompt.id },
      { orderBy: { startedAt: "desc", id: "desc" }, limit: 2_000 }
    );
    const byDay = new Map<string, PromptExecution>();
    for (const execution of executions) {
      if (!execution.responseDay || byDay.has(execution.responseDay)) {
        continue;
      }
      byDay.set(execution.responseDay, execution);
      if (byDay.size >= daysLimit) {
        break;
      }
    }

    return [...byDay.values()].sort((left, right) => {
      const leftDay = left.responseDay ?? "";
      const rightDay = right.responseDay ?? "";
      return leftDay.localeCompare(rightDay);
    });
  }

  async getPromptMatrixState(daysLimit = 11): Promise<{
    generatedAt: string;
    latestIngestAt: string | null;
    days: string[];
    prompts: PromptMatrixRow[];
  }> {
    await this.syncPromptDefinitions();
    const em = this.getEntityManager();
    const safeDaysLimit = Math.max(1, Math.min(Math.trunc(daysLimit), 20));
    const prompts = (await em.find(PromptDefinition, {}, { orderBy: { key: "asc" } }))
      .filter((prompt) => systemStatusPromptKeys.has(prompt.key));
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
          pe.error_message as "errorMessage",
          pe.submitted_text as "submittedText"
        from prompt_executions pe
        inner join prompt_definitions pd on pd.id = pe.prompt_id
        where pe.started_at >= ?
        order by pe.started_at desc, pe.id desc
      `,
      [cutoffDate]
    )) as PromptMatrixExecutionRecord[];
    const latestIngestAt = await this.getLatestIngestAt();
    const transcriptDays = await this.listTranscriptDays(safeDaysLimit);
    const cutoffDayString = dayjs(cutoffDate).utc().format("YYYY-MM-DD");
    const validExecutionDays = executions
      .flatMap((execution) => this.derivePromptMatrixExecutionDays(execution, cutoffDayString));
    const dayKeys = Array.from(new Set([...transcriptDays, ...validExecutionDays]))
      .sort((left, right) => left.localeCompare(right))
      .slice(-safeDaysLimit);

    const rowMap = new Map<string, PromptMatrixRow>();
    for (const prompt of prompts) {
      rowMap.set(prompt.key, {
        key: prompt.key,
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
      const executionDays = this.derivePromptMatrixExecutionDays(execution, cutoffDayString);
      for (const day of executionDays) {
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
