import { promises as fs, watch } from "node:fs";
import path from "node:path";
import type { MikroORM } from "@mikro-orm/postgresql";
import type { AnalysisService } from "./analysisService.js";
import type { PipelineService } from "./pipelineService.js";
import { ingestTranscriptCsvDirectory } from "./transcriptIngestionService.js";
import { liveUpdateBus } from "./liveUpdateBus.js";
import type { StatsService } from "./statsService.js";
import type { TimeWindowSummaryService } from "./timeWindowSummaryService.js";
import { serializeUnknownError, serverLogger } from "../utils/logging/serverLogger.js";

export type IngestionEventPayload = {
  trigger: string;
  status: "success" | "failure";
  sourcePath: string | null;
  details: Record<string, unknown>;
};

export type IngestionSchedulerOptions = {
  dataDir: string;
  sourceFilesDir: string;
  promptSubmissionsDir: string;
  pipelineAutoRun: boolean;
  pipelineIntervalHours: number;
  analysisService: AnalysisService;
  getTranscriptOrm: () => MikroORM | null;
  getPipelineService: () => PipelineService | null;
  getStatsService: () => StatsService | null;
  getTimeWindowSummaryService: () => TimeWindowSummaryService | null;
};

export class IngestionSchedulerService {
  private readonly AUTO_INGEST_DEBOUNCE_MS = 3_000;

  private pipelineIntervalStarted = false;
  private autoIngestTimer: NodeJS.Timeout | null = null;
  private autoIngestInProgress = false;
  private autoIngestQueued = false;
  private autoIngestLastReason = "startup";
  private autoIngestLastPath: string | null = null;
  private readonly watchTargets: string[];

  public constructor(private readonly options: IngestionSchedulerOptions) {
    this.watchTargets = Array.from(new Set([options.dataDir, options.sourceFilesDir]));
  }

  public async runStartupIngestion(): Promise<void> {
    serverLogger.info("Startup ingestion scheduled");

    try {
      const changedDayKeys = await this.runTranscriptAndPipelineRefresh({ trigger: "startup", sourcePath: null });

      const dashboard = await this.options.analysisService.ingestAndAnalyze();
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

      this.startPipelineSchedule();
      this.publishCacheUpdatedEvents("startup", dashboard.generatedAt, dashboard.days.length);
      if (changedDayKeys.size > 0) {
        serverLogger.info("Startup ingestion changed day keys", { count: changedDayKeys.size });
      }
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

  public async runManualIngestion(): Promise<void> {
    await this.runTranscriptAndPipelineRefresh({ trigger: "manual:/api/ingest", sourcePath: null });
    const cache = this.options.analysisService.getCache();
    await this.writeIngestionEventLog({
      trigger: "manual:/api/ingest",
      status: "success",
      sourcePath: null,
      details: {
        generatedAt: cache?.generatedAt ?? null,
        totalDays: cache?.days.length ?? null
      }
    });

    this.invalidateAndPrimeDerivedCaches("manual:/api/ingest");
    this.publishCacheUpdatedEvents("manual:/api/ingest", cache?.generatedAt ?? null, cache?.days.length ?? null);
  }

  public startBackgroundWorkers(): void {
    this.startFilesystemIngestionWatchers();
    this.startPipelineSchedule();
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
    const outputPath = path.join(this.options.promptSubmissionsDir, fileName);

    try {
      await fs.mkdir(this.options.promptSubmissionsDir, { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...payload }, null, 2)}\n`, "utf8");
    } catch (error) {
      serverLogger.warn("Failed to write ingestion event log artifact", {
        outputPath,
        error: serializeUnknownError(error)
      });
    }
  }

  private async runTranscriptAndPipelineRefresh(options?: { trigger?: string; sourcePath?: string | null }): Promise<Set<string>> {
    const trigger = options?.trigger ?? "ingestion-refresh";
    const sourcePath = options?.sourcePath ?? null;
    const em = this.options.getTranscriptOrm()?.em.fork();
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

      const transcriptIngestion = await ingestTranscriptCsvDirectory(this.options.dataDir, em, {
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

    const currentPipelineService = this.options.getPipelineService();
    if (currentPipelineService) {
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

    return changedDayKeys;
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
      const dashboard = await this.options.analysisService.ingestAndAnalyze();
      this.invalidateAndPrimeDerivedCaches("auto-ingestion");
      this.publishCacheUpdatedEvents("auto-ingestion", dashboard.generatedAt, dashboard.days.length);
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

  private startFilesystemIngestionWatchers(): void {
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

  private startPipelineSchedule(): void {
    const pipelineService = this.options.getPipelineService();
    if (!pipelineService || !this.options.pipelineAutoRun || this.pipelineIntervalStarted) {
      return;
    }

    this.pipelineIntervalStarted = true;
    const intervalMs = this.options.pipelineIntervalHours * 60 * 60 * 1000;

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

  private publishCacheUpdatedEvents(trigger: string, generatedAt: string | null, totalDays: number | null): void {
    liveUpdateBus.publish({
      type: "dashboard.cache.updated",
      payload: { trigger, generatedAt, totalDays }
    });
    liveUpdateBus.publish({ type: "stats.updated", payload: { trigger } });
    liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger } });
  }

  private invalidateAndPrimeDerivedCaches(trigger: string): void {
    const statsService = this.options.getStatsService();
    const timeWindowSummaryService = this.options.getTimeWindowSummaryService();

    statsService?.invalidateCaches();
    timeWindowSummaryService?.invalidateCache();
    if (statsService) {
      void statsService.primeCoreCaches().catch((error) => {
        serverLogger.warn("Failed to prime stats caches after ingestion", {
          trigger,
          error: serializeUnknownError(error)
        });
      });
    }
  }
}
