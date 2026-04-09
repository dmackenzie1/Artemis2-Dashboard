import express from "express";
import cors from "cors";
import { promises as fs, watch } from "node:fs";
import { RequestContext } from "@mikro-orm/core";
import { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import path from "node:path";
import { env } from "./env.config.js";
import { dayjs } from "./lib/dayjs.js";
import { LlmClient } from "./services/llmClient.js";
import { AnalysisService } from "./services/analysisService.js";
import { createApiRouter } from "./routes/api.js";
import { createTranscriptRouter } from "./routes/transcripts.js";
import ormConfig from "./mikro-orm.config.js";
import { PipelineService } from "./services/pipelineService.js";
import { createPipelineRouter } from "./routes/pipeline.js";
import { serializeUnknownError, serverLogger } from "./utils/logging/serverLogger.js";
import { StatsService } from "./services/statsService.js";
import { ingestTranscriptCsvDirectory } from "./services/transcriptIngestionService.js";
import { SystemLogsService } from "./services/systemLogsService.js";
import { createSystemLogsRouter } from "./routes/systemLogs.js";
import { TimeWindowSummaryService } from "./services/timeWindowSummaryService.js";
import { RedisLlmCache } from "./services/redisLlmCache.js";
import { liveUpdateBus } from "./services/liveUpdateBus.js";
import { TranscriptUtterance } from "./entities/TranscriptUtterance.js";
import { SummaryArtifact } from "./entities/SummaryArtifact.js";
import { loadTranscriptCandidates } from "./services/transcriptCandidateService.js";

const ensureTranscriptSearchIndexes = async (orm: MikroORM): Promise<void> => {
  await orm.em.getConnection().execute(`
    create index if not exists "idx_transcript_utterances_tokens_gin"
      on "transcript_utterances"
      using gin ("tokens");
  `);

  await orm.em.getConnection().execute(`
    create index if not exists "idx_transcript_utterances_channel_lower"
      on "transcript_utterances" (lower("channel"));
  `);
};

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});
app.get("/api/events", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, connectedAt: new Date().toISOString() })}\n\n`);

  const unsubscribe = liveUpdateBus.subscribe((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const keepAliveHandle = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 25_000);

  _req.on("close", () => {
    clearInterval(keepAliveHandle);
    unsubscribe();
    res.end();
  });
});

const redisLlmCache = env.REDIS_CACHE_ENABLED ? new RedisLlmCache(env.REDIS_URL) : null;
if (redisLlmCache) {
  try {
    await redisLlmCache.connect();
  } catch (error) {
    serverLogger.warn("Redis cache unavailable; continuing without LLM Redis cache", {
      redisUrl: env.REDIS_URL,
      error: serializeUnknownError(error)
    });
  }
}

const llmClient = new LlmClient(
  env.ANTHROPIC_BASE_URL,
  env.ANTHROPIC_API_KEY,
  env.ANTHROPIC_MODEL,
  env.LLM_DEBUG_PROMPTS_DIR,
  env.LLM_MAX_TOKENS,
  redisLlmCache ?? undefined,
  env.REDIS_CACHE_TTL_SECONDS,
  env.REDIS_CACHE_STALE_TTL_SECONDS
);
let llmConnectivityStatus = await llmClient.checkConnectivity();
const IN_MEMORY_UTTERANCE_LIMIT = 50_000;

const analysisService = new AnalysisService({
  promptsDir: env.PROMPTS_DIR,
  cacheFile: env.CACHE_FILE,
  llmClient,
  llmMaxTokens: env.LLM_MAX_TOKENS,
  loadTranscriptUtterances: async () => {
    if (!transcriptOrm) {
      return [];
    }

    const rows = await transcriptOrm.em.fork().find(
      TranscriptUtterance,
      {},
      { orderBy: { timestamp: "desc" }, limit: IN_MEMORY_UTTERANCE_LIMIT }
    );
    const sortedRows = [...rows].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    return sortedRows.map((row) => ({
      id: String(row.id),
      timestamp: dayjs(row.timestamp).utc().toISOString(),
      day: dayjs(row.timestamp).utc().format("YYYY-MM-DD"),
      hour: dayjs(row.timestamp).utc().format("HH:00"),
      channel: row.channel,
      durationSec: row.durationSec,
      language: row.language,
      translated: row.translated ? "yes" : "no",
      text: row.text,
      tokens: row.tokens,
      filename: row.filename,
      sourceFile: row.sourceFile
    }));
  },
  loadTranscriptCandidates: async (query, options) => {
    if (!transcriptOrm) {
      return [];
    }

    return loadTranscriptCandidates(transcriptOrm.em.fork(), query, options);
  },
  loadDailySummaryForDay: async (day) => {
    if (!transcriptOrm) {
      return null;
    }

    const summary = await transcriptOrm.em.fork().findOne(SummaryArtifact, {
      summaryType: "daily_full",
      day,
      channelGroup: "*"
    });
    return summary?.summary ?? null;
  }
});
const systemLogsService = new SystemLogsService({
  promptSubmissionsDir: env.PROMPT_SUBMISSIONS_DIR,
  llmDebugPromptsDir: env.LLM_DEBUG_PROMPTS_DIR
});

await analysisService.loadFromDisk();
let pipelineService: PipelineService | null = null;
let statsService: StatsService | null = null;
let transcriptOrm: MikroORM | null = null;
let pipelineIntervalStarted = false;
let timeWindowSummaryService: TimeWindowSummaryService | null = null;
const AUTO_INGEST_DEBOUNCE_MS = 3_000;
let autoIngestTimer: NodeJS.Timeout | null = null;
let autoIngestInProgress = false;
let autoIngestQueued = false;
let autoIngestLastReason = "startup";
let autoIngestLastPath: string | null = null;
const watchTargets = Array.from(new Set([env.DATA_DIR, env.SOURCE_FILES_DIR]));

type IngestionEventPayload = {
  trigger: string;
  status: "success" | "failure";
  sourcePath: string | null;
  details: Record<string, unknown>;
};

const publishSqlFileLoadStartedEvent = (options: { sourceFile: string; day: string; trigger: string; sourcePath: string | null }): void => {
  liveUpdateBus.publish({
    type: "sql.file.load.started",
    payload: {
      sourceFile: options.sourceFile,
      day: options.day,
      trigger: options.trigger,
      sourcePath: options.sourcePath
    }
  });
};

const publishSqlFileLoadCompletedEvent = (options: {
  sourceFile: string;
  day: string;
  inserted: number;
  deletedRows: number;
  skipped: number;
  parseErrors: number;
  utterancesInDatabase: number;
  trigger: string;
  sourcePath: string | null;
}): void => {
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
};

const publishDateLifecycleEvents = (options: {
  dayKeys: Set<string>;
  trigger: string;
  sourcePath: string | null;
  stage: "ingested" | "llm-loaded" | "notable-queries-updated";
}): void => {
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
};

const writeIngestionEventLog = async (payload: IngestionEventPayload): Promise<void> => {
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
};

const runTranscriptAndPipelineRefresh = async (options?: { trigger?: string; sourcePath?: string | null }): Promise<void> => {
  const trigger = options?.trigger ?? "ingestion-refresh";
  const sourcePath = options?.sourcePath ?? null;
  const em = transcriptOrm?.em.fork();
  let changedDayKeys = new Set<string>();
  if (em) {
    await writeIngestionEventLog({
      trigger: "ingestion-refresh",
      status: "success",
      sourcePath: null,
      details: {
        step: "reading-file"
      }
    });
    const transcriptIngestion = await ingestTranscriptCsvDirectory(env.DATA_DIR, em, {
      onFileLoadStarted: (event) => {
        publishSqlFileLoadStartedEvent({ ...event, trigger, sourcePath });
      },
      onFileLoadCompleted: (event) => {
        publishSqlFileLoadCompletedEvent({ ...event, trigger, sourcePath });
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
    publishDateLifecycleEvents({
      dayKeys: changedDayKeys,
      trigger,
      sourcePath,
      stage: "ingested"
    });
    serverLogger.info("Manual transcript ingestion completed", transcriptIngestion);
    await writeIngestionEventLog({
      trigger: "ingestion-refresh",
      status: "success",
      sourcePath: null,
      details: {
        step: "done",
        transcriptIngestion
      }
    });
  }

  const currentPipelineService = pipelineService;
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
    publishDateLifecycleEvents({
      dayKeys: changedDayKeys,
      trigger,
      sourcePath,
      stage: "llm-loaded"
    });
    publishDateLifecycleEvents({
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
};

const runAutoIngestion = async (): Promise<void> => {
  if (autoIngestInProgress) {
    autoIngestQueued = true;
    return;
  }

  autoIngestInProgress = true;
  const reason = autoIngestLastReason;
  const sourcePath = autoIngestLastPath;

  try {
    serverLogger.info("Auto-ingestion triggered by filesystem change", {
      reason,
      sourcePath
    });
    await runTranscriptAndPipelineRefresh({ trigger: reason, sourcePath });
    const dashboard = await analysisService.ingestAndAnalyze();
    statsService?.invalidateCaches();
    timeWindowSummaryService?.invalidateCache();
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
    await writeIngestionEventLog({
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
    await writeIngestionEventLog({
      trigger: reason,
      status: "failure",
      sourcePath,
      details: {
        error: serializeUnknownError(error)
      }
    });
  } finally {
    autoIngestInProgress = false;
    if (autoIngestQueued) {
      autoIngestQueued = false;
      void runAutoIngestion();
    }
  }
};

const scheduleAutoIngestion = (reason: string, sourcePath: string | null): void => {
  autoIngestLastReason = reason;
  autoIngestLastPath = sourcePath;

  if (autoIngestTimer) {
    clearTimeout(autoIngestTimer);
  }

  autoIngestTimer = setTimeout(() => {
    autoIngestTimer = null;
    void runAutoIngestion();
  }, AUTO_INGEST_DEBOUNCE_MS);
};

const startFilesystemIngestionWatchers = (): void => {
  for (const watchTarget of watchTargets) {
    try {
      watch(watchTarget, { persistent: false }, (eventType, fileName) => {
        const changedPath = fileName ? `${watchTarget}/${fileName.toString()}` : watchTarget;
        scheduleAutoIngestion(`fs:${eventType}`, changedPath);
      });
      serverLogger.info("Enabled filesystem watcher for auto-ingestion", { watchTarget });
    } catch (error) {
      serverLogger.warn("Failed to start filesystem watcher for auto-ingestion", {
        watchTarget,
        error: serializeUnknownError(error)
      });
    }
  }
};

const startPipelineSchedule = (): void => {
  if (!pipelineService || !env.PIPELINE_AUTO_RUN || pipelineIntervalStarted) {
    return;
  }

  pipelineIntervalStarted = true;
  const scheduledPipelineService = pipelineService;
  const intervalMs = env.PIPELINE_INTERVAL_HOURS * 60 * 60 * 1000;

  setInterval(() => {
    liveUpdateBus.publish({ type: "pipeline.run.started", payload: { trigger: "schedule" } });
    scheduledPipelineService.runPipelineCycle().then(() => {
      liveUpdateBus.publish({ type: "pipeline.run.completed", payload: { trigger: "schedule" } });
    }).catch((error) => {
      liveUpdateBus.publish({
        type: "pipeline.run.failed",
        payload: { trigger: "schedule", error: serializeUnknownError(error) }
      });
    });
  }, intervalMs);
};

const shutdown = async (): Promise<void> => {
  if (redisLlmCache) {
    await redisLlmCache.disconnect();
  }
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

app.use("/api/system-logs", createSystemLogsRouter(systemLogsService));

app.use(
  "/api",
  createApiRouter(analysisService, () => llmConnectivityStatus, async () => {
    await runTranscriptAndPipelineRefresh({ trigger: "manual:/api/ingest", sourcePath: null });
    const cache = analysisService.getCache();
    await writeIngestionEventLog({
      trigger: "manual:/api/ingest",
      status: "success",
      sourcePath: null,
      details: {
        generatedAt: cache?.generatedAt ?? null,
        totalDays: cache?.days.length ?? null
      }
    });
    statsService?.invalidateCaches();
    timeWindowSummaryService?.invalidateCache();
    if (statsService) {
      void statsService.primeCoreCaches().catch((error) => {
        serverLogger.warn("Failed to prime stats caches after ingestion", {
          error: serializeUnknownError(error)
        });
      });
    }
    liveUpdateBus.publish({
      type: "dashboard.cache.updated",
      payload: { trigger: "manual:/api/ingest", generatedAt: cache?.generatedAt ?? null, totalDays: cache?.days.length ?? null }
    });
    liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "manual:/api/ingest" } });
    liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "manual:/api/ingest" } });
  }, () => statsService, () => timeWindowSummaryService, async () => {
    analysisService.clearAnalysisCache();
    statsService?.invalidateCaches();
    timeWindowSummaryService?.invalidateCache();
    liveUpdateBus.publish({ type: "dashboard.cache.updated", payload: { trigger: "manual:/api/cache/clear", generatedAt: null, totalDays: null } });
    liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "manual:/api/cache/clear" } });
    liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "manual:/api/cache/clear" } });
  })
);

if (env.TRANSCRIPTS_DB_ENABLED) {
  serverLogger.info("Transcript database mode enabled");
  const orm = await MikroORM.init(ormConfig);
  transcriptOrm = orm;
  serverLogger.info("Transcript database connected", {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME
  });
  await orm.getSchemaGenerator().updateSchema();
  await ensureTranscriptSearchIndexes(orm);
  app.use((req, res, next) => RequestContext.create(orm.em, next));
  const getEntityManager = (): EntityManager => (RequestContext.getEntityManager() as EntityManager | undefined) ?? orm.em.fork();
  app.use("/api/transcripts", createTranscriptRouter(getEntityManager));
  statsService = new StatsService(getEntityManager);
  timeWindowSummaryService = new TimeWindowSummaryService(getEntityManager, llmClient, env.PROMPTS_DIR);

  pipelineService = new PipelineService(getEntityManager, {
    promptsDir: env.PROMPTS_DIR,
    llmClient,
    promptSubmissionsDir: env.PROMPT_SUBMISSIONS_DIR,
    notableMoments: {
      baselinePerDay: env.NOTABLE_MOMENTS_BASELINE_PER_DAY,
      minPerDay: env.NOTABLE_MOMENTS_MIN_PER_DAY,
      highSignalPerDay: env.NOTABLE_MOMENTS_HIGH_SIGNAL_PER_DAY,
      maxPerDay: env.NOTABLE_MOMENTS_MAX_PER_DAY
    }
  });

  app.use("/api/pipeline", createPipelineRouter(pipelineService));
} else {
  serverLogger.warn("Transcript database mode disabled");
  app.get("/api/transcripts/context", (_req, res) => {
    res.status(503).json({
      message: "Transcript DB is disabled. Set TRANSCRIPTS_DB_ENABLED=true to enable /api/transcripts/context."
    });
  });

  app.get("/api/pipeline/dashboard", (_req, res) => {
    res.status(503).json({
      message: "Pipeline DB is disabled. Set TRANSCRIPTS_DB_ENABLED=true to enable /api/pipeline endpoints."
    });
  });

  app.get("/api/stats/:segment?", (_req, res) => {
    res.status(503).json({
      message: "Stats DB is disabled. Set TRANSCRIPTS_DB_ENABLED=true to enable /api/stats endpoints."
    });
  });
}

const runStartupIngestion = async (): Promise<void> => {
  serverLogger.info("Startup ingestion scheduled");

  try {
    let changedDayKeys = new Set<string>();
    const em = transcriptOrm?.em.fork();
    if (em) {
      await writeIngestionEventLog({
        trigger: "startup",
        status: "success",
        sourcePath: null,
        details: {
          step: "reading-file"
        }
      });
      const transcriptIngestion = await ingestTranscriptCsvDirectory(env.DATA_DIR, em, {
        onFileLoadStarted: (event) => {
          publishSqlFileLoadStartedEvent({ ...event, trigger: "startup", sourcePath: null });
        },
        onFileLoadCompleted: (event) => {
          publishSqlFileLoadCompletedEvent({ ...event, trigger: "startup", sourcePath: null });
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
      publishDateLifecycleEvents({
        dayKeys: changedDayKeys,
        trigger: "startup",
        sourcePath: null,
        stage: "ingested"
      });
      serverLogger.info("Startup transcript ingestion completed", transcriptIngestion);
      await writeIngestionEventLog({
        trigger: "startup",
        status: "success",
        sourcePath: null,
        details: {
          step: "done",
          transcriptIngestion
        }
      });
    }

    const dashboard = await analysisService.ingestAndAnalyze();
    serverLogger.info("Startup ingestion completed", { generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length });
    await writeIngestionEventLog({
      trigger: "startup",
      status: "success",
      sourcePath: null,
      details: {
        generatedAt: dashboard.generatedAt,
        totalDays: dashboard.days.length
      }
    });

    const currentPipelineService = pipelineService;
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
      publishDateLifecycleEvents({
        dayKeys: changedDayKeys,
        trigger: "startup",
        sourcePath: null,
        stage: "llm-loaded"
      });
      publishDateLifecycleEvents({
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
      startPipelineSchedule();
    }
    liveUpdateBus.publish({
      type: "dashboard.cache.updated",
      payload: { trigger: "startup", generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length }
    });
    liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "startup" } });
    liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "startup" } });
  } catch (error) {
    serverLogger.error("Startup ingestion failed", { error: serializeUnknownError(error) });
    await writeIngestionEventLog({
      trigger: "startup",
      status: "failure",
      sourcePath: null,
      details: {
        error: serializeUnknownError(error)
      }
    });
  }
};
setInterval(() => {
  llmClient.checkConnectivity().then((status) => {
    const statusChanged =
      status.connected !== llmConnectivityStatus.connected ||
      status.model !== llmConnectivityStatus.model ||
      status.baseUrl !== llmConnectivityStatus.baseUrl ||
      status.error !== llmConnectivityStatus.error;
    llmConnectivityStatus = status;
    if (statusChanged) {
      liveUpdateBus.publish({
        type: "llm.connectivity.changed",
        payload: {
          connected: status.connected,
          model: status.model,
          baseUrl: status.baseUrl,
          error: status.error
        }
      });
    }
  }).catch(() => {
    // no-op
  });
}, 5 * 60 * 1000);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  serverLogger.error("Unhandled API error", { error: serializeUnknownError(error) });
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(500).json({ message });
});

app.listen(env.PORT, () => {
  void (async () => {
    await runStartupIngestion();
    startFilesystemIngestionWatchers();
    serverLogger.info("Backend is ready", { port: env.PORT });
  })();
});
