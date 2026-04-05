import express from "express";
import cors from "cors";
import { MikroORM } from "@mikro-orm/postgresql";
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
};

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));

const llmClient = new LlmClient(env.ANTHROPIC_BASE_URL, env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL);
let llmConnectivityStatus = await llmClient.checkConnectivity();

const analysisService = new AnalysisService({
  dataDir: env.DATA_DIR,
  promptsDir: env.PROMPTS_DIR,
  cacheFile: env.CACHE_FILE,
  llmClient
});

await analysisService.loadFromDisk();
let pipelineService: PipelineService | null = null;
let statsService: StatsService | null = null;
let pipelineIntervalStarted = false;
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

app.use(
  "/api",
  createApiRouter(analysisService, () => llmConnectivityStatus, async () => {
    const currentPipelineService = pipelineService;
    if (currentPipelineService) {
      await currentPipelineService.runPipelineCycle();
      serverLogger.info("Prompt workflow completed after ingestion");
    }
  }, () => statsService)
);

if (env.TRANSCRIPTS_DB_ENABLED) {
  serverLogger.info("Transcript database mode enabled");
  const orm = await MikroORM.init(ormConfig);
  serverLogger.info("Transcript database connected", {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME
  });
  await orm.getSchemaGenerator().updateSchema();
  await ensurePromptExecutionSubmittedTextColumn(orm);
  app.use("/api/transcripts", createTranscriptRouter(orm.em.fork()));
  statsService = new StatsService(orm.em.fork());

  pipelineService = new PipelineService(orm.em.fork(), {
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
  serverLogger.info("Backend is ready", { port: env.PORT });
  void runStartupIngestion();
});
