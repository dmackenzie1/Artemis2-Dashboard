import express from "express";
import cors from "cors";
import { watch } from "node:fs";
import { RequestContext } from "@mikro-orm/core";
import { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import { env } from "./env.config.js";
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

const ensurePromptExecutionSubmittedTextColumn = async (orm: MikroORM): Promise<void> => {
  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    add column if not exists "submitted_text" text;
  `);

  await orm.em.getConnection().execute(`
    update "prompt_executions"
    set "submitted_text" = ''
    where "submitted_text" is null;
  `);

  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    alter column "submitted_text" set default '',
    alter column "submitted_text" set not null;
  `);

  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    add column if not exists "component_id" varchar(128);
  `);
  await orm.em.getConnection().execute(`
    update "prompt_executions"
    set "component_id" = 'legacy'
    where "component_id" is null;
  `);
  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    alter column "component_id" set not null;
  `);

  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    add column if not exists "cache_key" varchar(64);
  `);
  await orm.em.getConnection().execute(`
    update "prompt_executions"
    set "cache_key" = ''
    where "cache_key" is null;
  `);
  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    alter column "cache_key" set not null;
  `);

  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    add column if not exists "cache_hit" boolean default false;
  `);
  await orm.em.getConnection().execute(`
    update "prompt_executions"
    set "cache_hit" = false
    where "cache_hit" is null;
  `);
  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    alter column "cache_hit" set not null;
  `);
};

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));

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
  env.REDIS_CACHE_TTL_SECONDS
);
let llmConnectivityStatus = await llmClient.checkConnectivity();

const analysisService = new AnalysisService({
  dataDir: env.DATA_DIR,
  promptsDir: env.PROMPTS_DIR,
  cacheFile: env.CACHE_FILE,
  llmClient
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

const runTranscriptAndPipelineRefresh = async (): Promise<void> => {
  const em = transcriptOrm?.em.fork();
  if (em) {
    const transcriptIngestion = await ingestTranscriptCsvDirectory(env.DATA_DIR, em);
    serverLogger.info("Manual transcript ingestion completed", transcriptIngestion);
  }

  const currentPipelineService = pipelineService;
  if (currentPipelineService) {
    await currentPipelineService.runPipelineCycle();
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
    const dashboard = await analysisService.ingestAndAnalyze();
    await runTranscriptAndPipelineRefresh();
    serverLogger.info("Auto-ingestion completed", {
      reason,
      sourcePath,
      generatedAt: dashboard.generatedAt,
      totalDays: dashboard.days.length
    });
  } catch (error) {
    serverLogger.error("Auto-ingestion failed", {
      reason,
      sourcePath,
      error: serializeUnknownError(error)
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
    scheduledPipelineService.runPipelineCycle().catch(() => {
      // no-op: failure is persisted in prompt_executions table
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
    await runTranscriptAndPipelineRefresh();
  }, () => statsService, () => timeWindowSummaryService)
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
  await ensurePromptExecutionSubmittedTextColumn(orm);
  app.use((req, res, next) => RequestContext.create(orm.em, next));
  const getEntityManager = (): EntityManager => (RequestContext.getEntityManager() as EntityManager | undefined) ?? orm.em.fork();
  app.use("/api/transcripts", createTranscriptRouter(getEntityManager));
  statsService = new StatsService(getEntityManager);
  timeWindowSummaryService = new TimeWindowSummaryService(getEntityManager, llmClient, env.PROMPTS_DIR);

  pipelineService = new PipelineService(getEntityManager, {
    sourceFilesDir: env.SOURCE_FILES_DIR,
    promptsDir: env.PROMPTS_DIR,
    llmClient,
    promptSubmissionsDir: env.PROMPT_SUBMISSIONS_DIR
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
    const em = transcriptOrm?.em.fork();
    if (em) {
      const transcriptIngestion = await ingestTranscriptCsvDirectory(env.DATA_DIR, em);
      serverLogger.info("Startup transcript ingestion completed", transcriptIngestion);
    }

    const dashboard = await analysisService.ingestAndAnalyze();
    serverLogger.info("Startup ingestion completed", { generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length });

    const currentPipelineService = pipelineService;
    if (currentPipelineService) {
      await currentPipelineService.runPipelineCycle();
      serverLogger.info("Startup prompt workflow completed");
      startPipelineSchedule();
    }
  } catch (error) {
    serverLogger.error("Startup ingestion failed", { error: serializeUnknownError(error) });
  }
};
setInterval(() => {
  llmClient.checkConnectivity().then((status) => {
    llmConnectivityStatus = status;
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
