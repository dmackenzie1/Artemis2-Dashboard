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

dayjs.extend(utc);

type PipelineConfig = {
  sourceFilesDir: string;
  promptsDir: string;
  llmClient: LlmClient;
};

type PromptDashboardEntry = {
  id: number;
  key: string;
  fileName: string;
  promptUpdatedAt: string;
  lastRunAt: string | null;
  status: "running" | "success" | "failed" | "never";
  output: string | null;
};

const promptFilePattern = /\.txt$/i;

export class PipelineService {
  private runInProgress = false;

  constructor(
    private readonly em: EntityManager,
    private readonly config: PipelineConfig
  ) {}

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
    } finally {
      this.runInProgress = false;
    }
  }

  async executePromptsSequentially(): Promise<void> {
    const prompts = await this.em.find(PromptDefinition, {}, { orderBy: { key: "asc" } });
    const sourceDocs = await this.em.find(SourceDocument, {}, { orderBy: { relativePath: "asc" } });

    const sourceContext = sourceDocs.map((doc) => ({
      path: doc.relativePath,
      content: doc.content
    }));

    for (const prompt of prompts) {
      const startedAt = dayjs().utc().toDate();
      const execution = this.em.create(PromptExecution, {
        prompt,
        startedAt,
        finishedAt: null,
        status: "running",
        output: "",
        errorMessage: null
      });
      this.em.persist(execution);
      await this.em.flush();

      try {
        const output = await this.config.llmClient.generateText({
          systemPrompt: prompt.content,
          userPrompt: JSON.stringify({
            generatedAt: dayjs().utc().toISOString(),
            sourceDocuments: sourceContext
          })
        });

        execution.status = "success";
        execution.output = output;
        execution.finishedAt = dayjs().utc().toDate();
      } catch (error) {
        execution.status = "failed";
        execution.output = "";
        execution.errorMessage = error instanceof Error ? error.message : "Unknown error";
        execution.finishedAt = dayjs().utc().toDate();
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
        output: latestExecution?.status === "success" ? latestExecution.output : null
      });
    }

    return {
      generatedAt: dayjs().utc().toISOString(),
      prompts: rows
    };
  }

  async runManualReingest(): Promise<{ changedDocuments: number }> {
    const changedDocuments = await this.syncSourceDocuments();
    return { changedDocuments };
  }
}
