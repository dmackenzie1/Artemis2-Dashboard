import { promises as fs, watch } from "node:fs";
import path from "node:path";
import type { EntityManager } from "@mikro-orm/postgresql";
import { env } from "../env.config.js";
import type { AnalysisService } from "./analysisService.js";
import { liveUpdateBus } from "./liveUpdateBus.js";
import type { PipelineService } from "./pipelineService.js";
import type { StatsService } from "./statsService.js";
import type { TimeWindowSummaryService } from "./timeWindowSummaryService.js";
import { ingestTranscriptCsvDirectory } from "./transcriptIngestionService.js";
import { serializeUnknownError, serverLogger } from "../utils/logging/serverLogger.js";

type IngestionEventPayload = {
  trigger: string;
  status: "success" | "failure";
  sourcePath: string | null;
  details: Record<string, unknown>;
};

type BackgroundWorkersServiceOptions = {
  analysisService: AnalysisService;
  getEntityManager: () => EntityManager | null;
  getPipelineService: () => PipelineService | null;
  getStatsService: () => StatsService | null;
  getTimeWindowSummaryService: () => TimeWindowSummaryService | null;
};

export type TranscriptRefreshOptions = {
  trigger?: string;
  sourcePath?: string | null;
};

export class BackgroundWorkersService {
  private readonly analysisService: AnalysisService;
  private readonly getEntityManager: () => EntityManager | null;
  private readonly getPipelineService: () => PipelineService | null;
  private readonly getStatsService: () => StatsService | null;
  private readonly getTimeWindowSummaryService: () => TimeWindowSummaryService | null;

  private readonly AUTO_INGEST_DEBOUNCE_MS = 3_000;
  private readonly watchTargets = Array.from(new Set([env.DATA_DIR, env.SOURCE_FILES_DIR]));

  private pipelineIntervalStarted = false;
  private autoIngestTimer: NodeJS.Timeout | null = null;
  private autoIngestInProgress = false;
  private autoIngestQueued = false;
  private autoIngestLastReason = "startup";
  private autoIngestLastPath: string | null = null;

  public constructor(options: BackgroundWorkersServiceOptions) {
    this.analysisService = options.analysisService;
    this.getEntityManager = options.getEntityManager;
    this.getPipelineService = options.getPipelineService;
    this.getStatsService = options.getStatsService;
    this.getTimeWindowSummaryService = options.getTimeWindowSummaryService;
  }

  public async runTranscriptAndPipelineRefresh(options?: TranscriptRefreshOptions): Promise<void> {
    const trigger = options?.trigger ?? "ingestion-refresh";
    const sourcePath = options?.sourcePath ?? null;
    const em = this.getEntityManager();
    let changedDayKeys = new Set<string>();

    if (em) {
      await this.writeIngestionEventLog({
        trigger: "ingestion-refresh",
        status: "success",
        sourcePath: null,
        details: {
          step: "reading-file"
        }
      });

      const transcriptIngestion = await ingestTranscriptCsvDirectory(env.DATA_DIR, em, {
        onFileLoadStarted: (event) => {
          this.publishSqlFileLoadStartedEvent({ ...event, trigger, sourcePath });
        },
        onFileLoadCompleted: (event) => {
          this.publishSqlFileLoadCompletedEvent({ ...event, trigger, sourcePath });
        }
      });

      changedDayKeys = new Set(transcriptIngestion.changedDayKeys);
      liveUpdateBus.publish({
        type: "sql.jobs.completed",
        payload: {
          trigger,
          sourcePath,
          filesProcessed: transcriptIngestion.filesProcessed,
          filesSkippedUnchanged: transcriptIngestion.filesSkippedUnchanged,
          inserted: transcriptIngestion.inserted,
          deleted: transcriptIngestion.deleted,
          skipped: transcriptIngestion.skipped,
          parseErrors: transcriptIngestion.parseErrors,
          utterancesInDatabase: transcriptIngestion.utterancesInDatabase,
          changedDayCount: transcriptIngestion.changedDayKeys.length
        }
      });

      this.publishDateLifecycleEvents({
        dayKeys: changedDayKeys,
        trigger,
        sourcePath,
        stage: "ingested"
      });
      serverLogger.info("Manual transcript ingestion completed", transcriptIngestion);

      await this.writeIngestionEventLog({
        trigger: "ingestion-refresh",
        status: "success",
        sourcePath: null,
        details: {
          step: "done",
          transcriptIngestion
        }
      });
    }

    const currentPipelineService = this.getPipelineService();
    if (!currentPipelineService) {
      return;
    }

    for (const dayKey of [...changedDayKeys].sort((left, right) => left.localeCompare(right))) {
      liveUpdateBus.publish({
        type: "llm.day.processing.started",
        payload: { day: dayKey, trigger, sourcePath }
      });
    }

    liveUpdateBus.publish({ type: "pipeline.run.started", payload: { trigger } });
    await currentPipelineService.runPipelineCycle({
      changedDayKeys,
      sourceDocumentsChanged: changedDayKeys.size > 0
    });

    this.publishDateLifecycleEvents({
      dayKeys: changedDayKeys,
      trigger,
      sourcePath,
      stage: "llm-loaded"
    });
    this.publishDateLifecycleEvents({
      dayKeys: changedDayKeys,
      trigger,
      sourcePath,
      stage: "notable-queries-updated"
    });

    for (const dayKey of [...changedDayKeys].sort((left, right) => left.localeCompare(right))) {
      liveUpdateBus.publish({
        type: "llm.day.processing.completed",
        payload: { day: dayKey, trigger, sourcePath }
      });
    }

    liveUpdateBus.publish({
      type: "llm.days.completed",
      payload: { trigger, sourcePath, changedDayCount: changedDayKeys.size }
    });
    liveUpdateBus.publish({ type: "pipeline.run.completed", payload: { trigger } });
    serverLogger.info("Prompt workflow completed after ingestion");
  }

  public startPipelineSchedule(): void {
    const pipelineService = this.getPipelineService();
    if (!pipelineService || !env.PIPELINE_AUTO_RUN || this.pipelineIntervalStarted) {
      return;
    }

    this.pipelineIntervalStarted = true;
    const intervalMs = env.PIPELINE_INTERVAL_HOURS * 60 * 60 * 1000;

    setInterval(() => {
      liveUpdateBus.publish({ type: "pipeline.run.started", payload: { trigger: "schedule" } });
      pipelineService
        .runPipelineCycle()
        .then(() => {
          liveUpdateBus.publish({ type: "pipeline.run.completed", payload: { trigger: "schedule" } });
        })
        .catch((error) => {
          liveUpdateBus.publish({
            type: "pipeline.run.failed",
            payload: { trigger: "schedule", error: serializeUnknownError(error) }
          });
        });
    }, intervalMs);
  }

  public startFilesystemIngestionWatchers(): void {
    for (const watchTarget of this.watchTargets) {
      try {
        watch(watchTarget, { persistent: false }, (eventType, fileName) => {
          const changedPath = fileName ? `${watchTarget}/${fileName.toString()}` : watchTarget;
          this.scheduleAutoIngestion(`fs:${eventType}`, changedPath);
        });
        serverLogger.info("Enabled filesystem watcher for auto-ingestion", { watchTarget });
      } catch (error) {
        serverLogger.warn("Failed to start filesystem watcher for auto-ingestion", {
          watchTarget,
          error: serializeUnknownError(error)
        });
      }
    }
  }

  public async runStartupIngestion(): Promise<void> {
    serverLogger.info("Startup ingestion scheduled");

    try {
      let changedDayKeys = new Set<string>();
      const em = this.getEntityManager();
      if (em) {
        await this.writeIngestionEventLog({
          trigger: "startup",
          status: "success",
          sourcePath: null,
          details: {
            step: "reading-file"
          }
        });

        const transcriptIngestion = await ingestTranscriptCsvDirectory(env.DATA_DIR, em, {
          onFileLoadStarted: (event) => {
            this.publishSqlFileLoadStartedEvent({ ...event, trigger: "startup", sourcePath: null });
          },
          onFileLoadCompleted: (event) => {
            this.publishSqlFileLoadCompletedEvent({ ...event, trigger: "startup", sourcePath: null });
          }
        });

        changedDayKeys = new Set(transcriptIngestion.changedDayKeys);
        liveUpdateBus.publish({
          type: "sql.jobs.completed",
          payload: {
            trigger: "startup",
            sourcePath: null,
            filesProcessed: transcriptIngestion.filesProcessed,
            filesSkippedUnchanged: transcriptIngestion.filesSkippedUnchanged,
            inserted: transcriptIngestion.inserted,
            deleted: transcriptIngestion.deleted,
            skipped: transcriptIngestion.skipped,
            parseErrors: transcriptIngestion.parseErrors,
            utterancesInDatabase: transcriptIngestion.utterancesInDatabase,
            changedDayCount: transcriptIngestion.changedDayKeys.length
          }
        });

        this.publishDateLifecycleEvents({
          dayKeys: changedDayKeys,
          trigger: "startup",
          sourcePath: null,
          stage: "ingested"
        });
        serverLogger.info("Startup transcript ingestion completed", transcriptIngestion);

        await this.writeIngestionEventLog({
          trigger: "startup",
          status: "success",
          sourcePath: null,
          details: {
            step: "done",
            transcriptIngestion
          }
        });
      }

      const dashboard = await this.analysisService.ingestAndAnalyze();
      serverLogger.info("Startup ingestion completed", { generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length });
      await this.writeIngestionEventLog({
        trigger: "startup",
        status: "success",
        sourcePath: null,
        details: {
          generatedAt: dashboard.generatedAt,
          totalDays: dashboard.days.length
        }
      });

      const currentPipelineService = this.getPipelineService();
      if (currentPipelineService) {
        for (const dayKey of [...changedDayKeys].sort((left, right) => left.localeCompare(right))) {
          liveUpdateBus.publish({
            type: "llm.day.processing.started",
            payload: { day: dayKey, trigger: "startup", sourcePath: null }
          });
        }

        liveUpdateBus.publish({ type: "pipeline.run.started", payload: { trigger: "startup" } });
        await currentPipelineService.runPipelineCycle({
          changedDayKeys,
          sourceDocumentsChanged: changedDayKeys.size > 0
        });

        this.publishDateLifecycleEvents({
          dayKeys: changedDayKeys,
          trigger: "startup",
          sourcePath: null,
          stage: "llm-loaded"
        });
        this.publishDateLifecycleEvents({
          dayKeys: changedDayKeys,
          trigger: "startup",
          sourcePath: null,
          stage: "notable-queries-updated"
        });

        for (const dayKey of [...changedDayKeys].sort((left, right) => left.localeCompare(right))) {
          liveUpdateBus.publish({
            type: "llm.day.processing.completed",
            payload: { day: dayKey, trigger: "startup", sourcePath: null }
          });
        }

        liveUpdateBus.publish({
          type: "llm.days.completed",
          payload: { trigger: "startup", sourcePath: null, changedDayCount: changedDayKeys.size }
        });
        liveUpdateBus.publish({ type: "pipeline.run.completed", payload: { trigger: "startup" } });
        serverLogger.info("Startup prompt workflow completed");
        this.startPipelineSchedule();
      }

      liveUpdateBus.publish({
        type: "dashboard.cache.updated",
        payload: { trigger: "startup", generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length }
      });
      liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "startup" } });
      liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "startup" } });
    } catch (error) {
      serverLogger.error("Startup ingestion failed", { error: serializeUnknownError(error) });
      await this.writeIngestionEventLog({
        trigger: "startup",
        status: "failure",
        sourcePath: null,
        details: {
          error: serializeUnknownError(error)
        }
      });
    }
  }

  private async runAutoIngestion(): Promise<void> {
    if (this.autoIngestInProgress) {
      this.autoIngestQueued = true;
      return;
    }

    this.autoIngestInProgress = true;
    const reason = this.autoIngestLastReason;
    const sourcePath = this.autoIngestLastPath;

    try {
      serverLogger.info("Auto-ingestion triggered by filesystem change", {
        reason,
        sourcePath
      });

      await this.runTranscriptAndPipelineRefresh({ trigger: reason, sourcePath });
      const dashboard = await this.analysisService.ingestAndAnalyze();
      this.getStatsService()?.invalidateCaches();
      this.getTimeWindowSummaryService()?.invalidateCache();
      const statsService = this.getStatsService();
      if (statsService) {
        void statsService.primeCoreCaches().catch((error) => {
          serverLogger.warn("Failed to prime stats caches after auto-ingestion", {
            error: serializeUnknownError(error)
          });
        });
      }

      liveUpdateBus.publish({
        type: "dashboard.cache.updated",
        payload: { trigger: "auto-ingestion", generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length }
      });
      liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "auto-ingestion" } });
      liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "auto-ingestion" } });
      serverLogger.info("Auto-ingestion completed", {
        reason,
        sourcePath,
        generatedAt: dashboard.generatedAt,
        totalDays: dashboard.days.length
      });

      await this.writeIngestionEventLog({
        trigger: reason,
        status: "success",
        sourcePath,
        details: {
          generatedAt: dashboard.generatedAt,
          totalDays: dashboard.days.length
        }
      });
    } catch (error) {
      serverLogger.error("Auto-ingestion failed", {
        reason,
        sourcePath,
        error: serializeUnknownError(error)
      });
      await this.writeIngestionEventLog({
        trigger: reason,
        status: "failure",
        sourcePath,
        details: {
          error: serializeUnknownError(error)
        }
      });
    } finally {
      this.autoIngestInProgress = false;
      if (this.autoIngestQueued) {
        this.autoIngestQueued = false;
        void this.runAutoIngestion();
      }
    }
  }

  private scheduleAutoIngestion(reason: string, sourcePath: string | null): void {
    this.autoIngestLastReason = reason;
    this.autoIngestLastPath = sourcePath;

    if (this.autoIngestTimer) {
      clearTimeout(this.autoIngestTimer);
    }

    this.autoIngestTimer = setTimeout(() => {
      this.autoIngestTimer = null;
      void this.runAutoIngestion();
    }, this.AUTO_INGEST_DEBOUNCE_MS);
  }

  private publishSqlFileLoadStartedEvent(options: {
    sourceFile: string;
    day: string;
    trigger: string;
    sourcePath: string | null;
  }): void {
    liveUpdateBus.publish({
      type: "sql.file.load.started",
      payload: {
        sourceFile: options.sourceFile,
        day: options.day,
        trigger: options.trigger,
        sourcePath: options.sourcePath
      }
    });
  }

  private publishSqlFileLoadCompletedEvent(options: {
    sourceFile: string;
    day: string;
    inserted: number;
    deletedRows: number;
    skipped: number;
    parseErrors: number;
    utterancesInDatabase: number;
    trigger: string;
    sourcePath: string | null;
  }): void {
    liveUpdateBus.publish({
      type: "sql.file.load.completed",
      payload: {
        sourceFile: options.sourceFile,
        day: options.day,
        inserted: options.inserted,
        deletedRows: options.deletedRows,
        skipped: options.skipped,
        parseErrors: options.parseErrors,
        utterancesInDatabase: options.utterancesInDatabase,
        trigger: options.trigger,
        sourcePath: options.sourcePath
      }
    });
  }

  private publishDateLifecycleEvents(options: {
    dayKeys: Set<string>;
    trigger: string;
    sourcePath: string | null;
    stage: "ingested" | "llm-loaded" | "notable-queries-updated";
  }): void {
    const sortedDayKeys = [...options.dayKeys].sort((left, right) => left.localeCompare(right));
    for (const dayKey of sortedDayKeys) {
      if (options.stage === "ingested") {
        liveUpdateBus.publish({
          type: "day.ingested",
          payload: { day: dayKey, trigger: options.trigger, sourcePath: options.sourcePath }
        });
      } else if (options.stage === "llm-loaded") {
        liveUpdateBus.publish({
          type: "day.llm.loaded",
          payload: { day: dayKey, trigger: options.trigger, sourcePath: options.sourcePath }
        });
      } else {
        liveUpdateBus.publish({
          type: "day.notable-queries.updated",
          payload: { day: dayKey, trigger: options.trigger, sourcePath: options.sourcePath }
        });
      }

      liveUpdateBus.publish({
        type: "date.updated",
        payload: { day: dayKey, stage: options.stage, trigger: options.trigger, sourcePath: options.sourcePath }
      });
    }
  }

  private async writeIngestionEventLog(payload: IngestionEventPayload): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const fileName = `${timestamp}-ingestion-event.json`;
    const outputPath = path.join(env.PROMPT_SUBMISSIONS_DIR, fileName);

    try {
      await fs.mkdir(env.PROMPT_SUBMISSIONS_DIR, { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...payload }, null, 2)}\n`, "utf8");
    } catch (error) {
      serverLogger.warn("Failed to write ingestion event log artifact", {
        outputPath,
        error: serializeUnknownError(error)
      });
    }
  }
}

export const createBackgroundWorkersService = (
  options: BackgroundWorkersServiceOptions
): BackgroundWorkersService => new BackgroundWorkersService(options);
