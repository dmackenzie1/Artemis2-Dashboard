import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EntityManager } from "@mikro-orm/postgresql";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { PromptDefinition } from "../entities/PromptDefinition.js";
import { PromptExecution } from "../entities/PromptExecution.js";
import { SourceDocument } from "../entities/SourceDocument.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

dayjs.extend(utc);

type PipelineConfig = {
  sourceFilesDir: string;
  promptsDir: string;
  llmClient: LlmClient;
  promptSubmissionsDir: string;
};

type PromptDashboardEntry = {
  id: number;
  key: string;
  fileName: string;
  promptUpdatedAt: string;
  lastRunAt: string | null;
  status: "running" | "success" | "failed" | "never";
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
const promptExecutionPriority = ["mission_summary", "daily_summary"];
const skippedPromptKeys = new Set(["hourly_summary"]);

export class PipelineService {
  private runInProgress = false;
  private missionStatsCache: { computedAtMs: number; payload: MissionStatsView } | null = null;

  constructor(
    private readonly em: EntityManager,
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
      const existing = await this.em.findOne(SourceDocument, { relativePath });

      if (!existing) {
        const created = this.em.create(SourceDocument, {
          relativePath,
          checksum,
          content,
          fileModifiedAt: stat.mtime,
          ingestedAt: now
        });

        this.em.persist(created);
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

    await this.em.flush();
    return changedCount;
  }

  async syncPromptDefinitions(): Promise<void> {
    const entries = await fs.readdir(this.config.promptsDir, { withFileTypes: true });
    const promptFiles = entries
      .filter((entry) => entry.isFile() && promptFilePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();

    const now = dayjs().utc().toDate();

    for (const fileName of promptFiles) {
      const promptText = await fs.readFile(path.join(this.config.promptsDir, fileName), "utf8");
      const key = fileName.replace(/\.txt$/i, "");
      const existing = await this.em.findOne(PromptDefinition, { fileName });

      if (!existing) {
        const created = this.em.create(PromptDefinition, {
          key,
          fileName,
          content: promptText,
          updatedAt: now
        });
        this.em.persist(created);
        continue;
      }

      if (existing.content !== promptText || existing.key !== key) {
        existing.content = promptText;
        existing.key = key;
        existing.updatedAt = now;
      }
    }

    await this.em.flush();
  }

  async runPipelineCycle(): Promise<void> {
    if (this.runInProgress) {
      return;
    }

    this.runInProgress = true;
    try {
      await this.syncSourceDocuments();
      await this.syncPromptDefinitions();
      await this.executePromptsSequentially();
      this.missionStatsCache = null;
    } finally {
      this.runInProgress = false;
    }
  }

  async executePromptsSequentially(): Promise<void> {
    const allPrompts = await this.em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    const prompts = this.buildPromptQueue(allPrompts);
    const sourceDocs = await this.em.find(SourceDocument, {}, { orderBy: { relativePath: "asc" } });

    const sourceContext = sourceDocs.map((doc) => ({
      path: doc.relativePath,
      content: doc.content
    }));

    for (const prompt of prompts) {
      const startedAt = dayjs().utc().toDate();
      const submittedText = JSON.stringify(
        {
          generatedAt: dayjs().utc().toISOString(),
          sourceDocuments: sourceContext
        },
        null,
        2
      );
      const execution = this.em.create(PromptExecution, {
        prompt,
        startedAt,
        finishedAt: null,
        status: "running",
        submittedText,
        output: "",
        errorMessage: null
      });
      this.em.persist(execution);
      await this.em.flush();
      const promptSubmissionPath = await this.persistPromptSubmission(prompt.key, submittedText);
      serverLogger.info("Prompt execution started", {
        promptKey: prompt.key,
        sourceDocumentCount: sourceContext.length,
        submissionPath: promptSubmissionPath
      });

      try {
        const output = await this.config.llmClient.generateText({
          systemPrompt: prompt.content,
          userPrompt: submittedText
        });

        execution.status = "success";
        execution.output = output;
        execution.finishedAt = dayjs().utc().toDate();
        serverLogger.info("Prompt response received", {
          promptKey: prompt.key,
          status: execution.status,
          outputLength: output.length
        });
      } catch (error) {
        execution.status = "failed";
        execution.output = "";
        execution.errorMessage = error instanceof Error ? error.message : "Unknown error";
        execution.finishedAt = dayjs().utc().toDate();
        serverLogger.error("Prompt response failed", {
          promptKey: prompt.key,
          errorMessage: execution.errorMessage
        });
      }

      await this.em.flush();
    }
  }

  async getDashboardView(): Promise<{ generatedAt: string; prompts: PromptDashboardEntry[] }> {
    const prompts = await this.em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    const rows: PromptDashboardEntry[] = [];

    for (const prompt of prompts) {
      const latestExecution = await this.em.findOne(
        PromptExecution,
        { prompt: prompt.id },
        { orderBy: { startedAt: "desc" } }
      );

      rows.push({
        id: prompt.id,
        key: prompt.key,
        fileName: prompt.fileName,
        promptUpdatedAt: dayjs(prompt.updatedAt).utc().toISOString(),
        lastRunAt: latestExecution ? dayjs(latestExecution.startedAt).utc().toISOString() : null,
        status: latestExecution?.status ?? "never",
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
    if (this.missionStatsCache && nowMs - this.missionStatsCache.computedAtMs < 30_000) {
      return this.missionStatsCache.payload;
    }

    const [{ minTimestamp, maxTimestamp, utterances, words }] = await this.em.getConnection().execute<{
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
          sum(cardinality(regexp_split_to_array(trim(text), E'\\s+')))::text as "words"
        from transcript_utterances
      `
    );

    const [{ dataDays }] = await this.em.getConnection().execute<{ dataDays: string }[]>(
      `
        select count(distinct date(timestamp at time zone 'utc'))::text as "dataDays"
        from transcript_utterances
      `
    );

    const utterancesPerHourRaw = await this.em.getConnection().execute<{ hour: string; utterances: string }[]>(
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
