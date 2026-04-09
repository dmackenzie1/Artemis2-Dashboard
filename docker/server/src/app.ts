import cors from "cors";
import express from "express";
import type { RequestHandler } from "express";
import type { EntityManager } from "@mikro-orm/postgresql";
import { RequestContext } from "@mikro-orm/core";
import type { MikroORM } from "@mikro-orm/postgresql";
import type { AnalysisService } from "./services/analysisService.js";
import { createApiRouter } from "./routes/api.js";
import { createTranscriptRouter } from "./routes/transcripts.js";
import type { LlmConnectivityStatus } from "./services/llmClient.js";
import type { PipelineService } from "./services/pipelineService.js";
import { createPipelineRouter } from "./routes/pipeline.js";
import { liveUpdateBus } from "./services/liveUpdateBus.js";
import type { StatsService } from "./services/statsService.js";
import type { SystemLogsService } from "./services/systemLogsService.js";
import { createSystemLogsRouter } from "./routes/systemLogs.js";
import type { TimeWindowSummaryService } from "./services/timeWindowSummaryService.js";
import { serializeUnknownError, serverLogger } from "./utils/logging/serverLogger.js";

export type ServerAppOptions = {
  corsOrigin: string;
  analysisService: AnalysisService;
  systemLogsService: SystemLogsService;
  getLlmConnectivityStatus: () => LlmConnectivityStatus;
  onManualIngest: () => Promise<void>;
  onClearServerCaches: () => Promise<void>;
  getStatsService: () => StatsService | null;
  getTimeWindowSummaryService: () => TimeWindowSummaryService | null;
};

export const createServerApp = (options: ServerAppOptions): express.Express => {
  const app = express();

  app.use(cors({ origin: options.corsOrigin }));
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

  app.use("/api/system-logs", createSystemLogsRouter(options.systemLogsService));
  app.use(
    "/api",
    createApiRouter(
      options.analysisService,
      options.getLlmConnectivityStatus,
      options.onManualIngest,
      options.getStatsService,
      options.getTimeWindowSummaryService,
      options.onClearServerCaches
    )
  );

  return app;
};

export const attachDatabaseRoutes = (
  app: express.Express,
  options: {
    orm: MikroORM;
  }
): { getEntityManager: () => EntityManager } => {
  app.use(((req, _res, next) => RequestContext.create(options.orm.em, next)) as RequestHandler);
  const getEntityManager = (): EntityManager =>
    (RequestContext.getEntityManager() as EntityManager | undefined) ?? options.orm.em.fork();

  app.use("/api/transcripts", createTranscriptRouter(getEntityManager));

  return { getEntityManager };
};

export const attachPipelineRoutes = (app: express.Express, pipelineService: PipelineService): void => {
  app.use("/api/pipeline", createPipelineRouter(pipelineService));
};

export const attachDatabaseDisabledRoutes = (app: express.Express): void => {
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
};

export const attachErrorHandler = (app: express.Express): void => {
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    serverLogger.error("Unhandled API error", { error: serializeUnknownError(error) });
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ message });
  });
};
