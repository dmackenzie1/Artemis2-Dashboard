import { MikroORM } from "@mikro-orm/postgresql";
import { dayjs } from "./lib/dayjs.js";
import ormConfig from "./mikro-orm.config.js";
import { createServerApp } from "./app.js";
import { env } from "./env.config.js";
import { runRuntimeMigrations } from "./migrations/runtimeMigrations.js";
import { SummaryArtifact } from "./entities/SummaryArtifact.js";
import { TranscriptUtterance } from "./entities/TranscriptUtterance.js";
import { AnalysisService } from "./services/analysisService.js";
import type { LlmConnectivityStatus } from "./services/llmClient.js";
import { LlmClient } from "./services/llmClient.js";
import { liveUpdateBus } from "./services/liveUpdateBus.js";
import { PipelineService } from "./services/pipelineService.js";
import { RedisLlmCache } from "./services/redisLlmCache.js";
import { createBackgroundWorkersService } from "./services/backgroundWorkersService.js";
import { StatsService } from "./services/statsService.js";
import { SystemLogsService } from "./services/systemLogsService.js";
import { TimeWindowSummaryService } from "./services/timeWindowSummaryService.js";
import { loadTranscriptCandidates } from "./services/transcriptCandidateService.js";
import { serializeUnknownError, serverLogger } from "./utils/logging/serverLogger.js";

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

let llmConnectivityStatus: LlmConnectivityStatus = await llmClient.checkConnectivity();

let transcriptOrm: MikroORM | null = null;
let pipelineService: PipelineService | null = null;
let statsService: StatsService | null = null;
let timeWindowSummaryService: TimeWindowSummaryService | null = null;

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

    const rows = await transcriptOrm.em
      .fork()
      .find(TranscriptUtterance, {}, { orderBy: { timestamp: "desc" }, limit: IN_MEMORY_UTTERANCE_LIMIT });
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

if (env.TRANSCRIPTS_DB_ENABLED) {
  serverLogger.info("Transcript database mode enabled");
  transcriptOrm = await MikroORM.init(ormConfig);

  serverLogger.info("Transcript database connected", {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME
  });

  await transcriptOrm.getSchemaGenerator().updateSchema();
  await runRuntimeMigrations(transcriptOrm);

  const getEntityManager = () => transcriptOrm?.em.fork() ?? null;
  statsService = new StatsService(() => getEntityManager()!);
  timeWindowSummaryService = new TimeWindowSummaryService(() => getEntityManager()!, llmClient, env.PROMPTS_DIR);
  pipelineService = new PipelineService(() => getEntityManager()!, {
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
} else {
  serverLogger.warn("Transcript database mode disabled");
}

const backgroundWorkersService = createBackgroundWorkersService({
  analysisService,
  getEntityManager: () => transcriptOrm?.em.fork() ?? null,
  getPipelineService: () => pipelineService,
  getStatsService: () => statsService,
  getTimeWindowSummaryService: () => timeWindowSummaryService
});

const app = createServerApp({
  analysisService,
  systemLogsService,
  getLlmConnectivityStatus: () => llmConnectivityStatus,
  onManualIngest: async () => {
    await backgroundWorkersService.runTranscriptAndPipelineRefresh({ trigger: "manual:/api/ingest", sourcePath: null });

    const cache = analysisService.getCache();
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
  },
  onClearCaches: async () => {
    analysisService.clearAnalysisCache();
    statsService?.invalidateCaches();
    timeWindowSummaryService?.invalidateCache();
    liveUpdateBus.publish({
      type: "dashboard.cache.updated",
      payload: { trigger: "manual:/api/cache/clear", generatedAt: null, totalDays: null }
    });
    liveUpdateBus.publish({ type: "stats.updated", payload: { trigger: "manual:/api/cache/clear" } });
    liveUpdateBus.publish({ type: "time-window-summary.updated", payload: { trigger: "manual:/api/cache/clear" } });
  },
  getStatsService: () => statsService,
  getTimeWindowSummaryService: () => timeWindowSummaryService,
  transcriptOrm,
  pipelineService
});

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

setInterval(() => {
  llmClient
    .checkConnectivity()
    .then((status) => {
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
    })
    .catch(() => {
      // no-op
    });
}, 5 * 60 * 1000);

app.listen(env.PORT, () => {
  void (async () => {
    await backgroundWorkersService.runStartupIngestion();
    backgroundWorkersService.startFilesystemIngestionWatchers();
    serverLogger.info("Backend is ready", { port: env.PORT });
  })();
});
