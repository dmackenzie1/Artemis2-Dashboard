import type express from "express";
import { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import { env } from "../env.config.js";
import { dayjs } from "../lib/dayjs.js";
import ormConfig from "../mikro-orm.config.js";
import { attachDatabaseDisabledRoutes, attachDatabaseRoutes, attachErrorHandler, attachPipelineRoutes, createServerApp } from "../app.js";
import { AnalysisService } from "../services/analysisService.js";
import { BackgroundWorkersService } from "../services/backgroundWorkersService.js";
import { IngestionSchedulerService } from "../services/ingestionSchedulerService.js";
import { LlmClient } from "../services/llmClient.js";
import { loadTranscriptCandidates } from "../services/transcriptCandidateService.js";
import { PipelineService } from "../services/pipelineService.js";
import { RedisLlmCache } from "../services/redisLlmCache.js";
import { StatsService } from "../services/statsService.js";
import { SystemLogsService } from "../services/systemLogsService.js";
import { TimeWindowSummaryService } from "../services/timeWindowSummaryService.js";
import { SummaryArtifact } from "../entities/SummaryArtifact.js";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { liveUpdateBus } from "../services/liveUpdateBus.js";
import { serializeUnknownError, serverLogger } from "../utils/logging/serverLogger.js";

export type ServerRuntime = {
  app: express.Express;
  onServerReady: () => Promise<void>;
  shutdown: () => Promise<void>;
};

const IN_MEMORY_UTTERANCE_LIMIT = 50_000;

const publishCacheClearedEvents = (): void => {
  liveUpdateBus.publish({
    type: "dashboard.cache.updated",
    payload: { trigger: "manual:/api/cache/clear", generatedAt: null, totalDays: null }
  });
  liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "manual:/api/cache/clear" } });
  liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "manual:/api/cache/clear" } });
};

const createCacheClearHandler = (
  analysisService: AnalysisService,
  options?: {
    statsService?: () => StatsService | null;
    timeWindowSummaryService?: () => TimeWindowSummaryService | null;
  }
): (() => Promise<void>) => {
  return async () => {
    analysisService.clearAnalysisCache();
    options?.statsService?.()?.invalidateCaches();
    options?.timeWindowSummaryService?.()?.invalidateCache();
    publishCacheClearedEvents();
  };
};

const createShutdownHandler = (
  backgroundWorkers: BackgroundWorkersService,
  redisLlmCache: RedisLlmCache | null
): (() => Promise<void>) => {
  return async () => {
    backgroundWorkers.stop();
    if (redisLlmCache) {
      await redisLlmCache.disconnect();
    }
  };
};

export const createServerRuntime = async (): Promise<ServerRuntime> => {
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

  let transcriptOrm: MikroORM | null = null;
  let pipelineService: PipelineService | null = null;
  let statsService: StatsService | null = null;
  let timeWindowSummaryService: TimeWindowSummaryService | null = null;

  const analysisService = new AnalysisService({
    promptsDir: env.PROMPTS_DIR,
    cacheFile: env.CACHE_FILE,
    llmClient,
    llmMaxTokens: env.LLM_MAX_TOKENS,
    loadTranscriptUtterances: async () => {
      if (!transcriptOrm) {
        return [];
      }

      // Fetch DESC + LIMIT to get the *most recent* IN_MEMORY_UTTERANCE_LIMIT
      // rows efficiently using the timestamp index, then re-sort ASC so the
      // analysis service receives utterances in chronological order. A single
      // ASC query with LIMIT would return the oldest rows, which is incorrect.
      // The in-memory re-sort is O(n log n) on at most IN_MEMORY_UTTERANCE_LIMIT
      // items and is intentional — do not remove it.
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

  const ingestionScheduler = new IngestionSchedulerService({
    dataDir: env.DATA_DIR,
    sourceFilesDir: env.SOURCE_FILES_DIR,
    promptSubmissionsDir: env.PROMPT_SUBMISSIONS_DIR,
    pipelineAutoRun: env.PIPELINE_AUTO_RUN,
    pipelineIntervalHours: env.PIPELINE_INTERVAL_HOURS,
    analysisService,
    getTranscriptOrm: () => transcriptOrm,
    getPipelineService: () => pipelineService,
    getStatsService: () => statsService,
    getTimeWindowSummaryService: () => timeWindowSummaryService
  });

  const backgroundWorkers = new BackgroundWorkersService({ llmClient, ingestionScheduler });
  await backgroundWorkers.initializeLlmConnectivityStatus();

  // When the transcript DB is enabled, initialise the ORM before creating the
  // Express app so we can pass it into createServerApp and have the
  // RequestContext middleware registered before any /api routes are mounted.
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

    const app = createServerApp({
      corsOrigin: env.CORS_ORIGIN,
      analysisService,
      systemLogsService,
      getLlmConnectivityStatus: () => backgroundWorkers.getLlmConnectivityStatus(),
      onManualIngest: async () => {
        await ingestionScheduler.runManualIngestion();
      },
      onClearServerCaches: createCacheClearHandler(analysisService, {
        statsService: () => statsService,
        timeWindowSummaryService: () => timeWindowSummaryService
      }),
      getStatsService: () => statsService,
      getTimeWindowSummaryService: () => timeWindowSummaryService,
      // Pass orm so RequestContext middleware is registered before /api routes.
      orm
    });

    const { getEntityManager } = attachDatabaseRoutes(app, { orm });

    const getEntityManagerRef = (): EntityManager => getEntityManager();
    statsService = new StatsService(getEntityManagerRef);
    timeWindowSummaryService = new TimeWindowSummaryService(getEntityManagerRef, llmClient, env.PROMPTS_DIR);
    pipelineService = new PipelineService(getEntityManagerRef, {
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
    attachPipelineRoutes(app, pipelineService);
    attachErrorHandler(app);

    return {
      app,
      onServerReady: async () => {
        await backgroundWorkers.startOnServerReady();
      },
      shutdown: createShutdownHandler(backgroundWorkers, redisLlmCache)
    };
  }

  // DB-disabled path: build the app without ORM/RequestContext wiring.
  const app = createServerApp({
    corsOrigin: env.CORS_ORIGIN,
    analysisService,
    systemLogsService,
    getLlmConnectivityStatus: () => backgroundWorkers.getLlmConnectivityStatus(),
    onManualIngest: async () => {
      await ingestionScheduler.runManualIngestion();
    },
    onClearServerCaches: createCacheClearHandler(analysisService),
    getStatsService: () => statsService,
    getTimeWindowSummaryService: () => timeWindowSummaryService
  });

  serverLogger.warn("Transcript database mode disabled");
  attachDatabaseDisabledRoutes(app);
  attachErrorHandler(app);

  return {
    app,
    onServerReady: async () => {
      await backgroundWorkers.startOnServerReady();
    },
    shutdown: createShutdownHandler(backgroundWorkers, redisLlmCache)
  };
};
