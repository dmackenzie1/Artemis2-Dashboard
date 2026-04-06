import { Router } from "express";
import { z } from "zod";
import type { PipelineService } from "../services/pipelineService.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

export const createPipelineRouter = (pipelineService: PipelineService): Router => {
  const router = Router();

  router.get("/dashboard", async (_req, res, next) => {
    try {
      const payload = await pipelineService.getDashboardView();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/ingest", async (_req, res, next) => {
    try {
      const result = await pipelineService.runManualReingest();
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/run", async (_req, res, next) => {
    try {
      const wasAlreadyRunning = pipelineService.isPipelineRunInProgress();
      if (!wasAlreadyRunning) {
        void pipelineService.runPipelineCycle().catch((error: unknown) => {
          serverLogger.error("Pipeline run failed after async trigger", {
            error: error instanceof Error ? error.message : "Unknown error"
          });
        });
      }
      res.status(202).json({
        accepted: !wasAlreadyRunning,
        status: wasAlreadyRunning ? "already-running" : "started"
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/stats", async (_req, res, next) => {
    try {
      const payload = await pipelineService.getMissionStatsView();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/notable-moments", async (_req, res, next) => {
    try {
      const payload = await pipelineService.getDashboardView();
      const notableMomentsPrompt = payload.prompts.find((entry) => entry.key === "notable_moments");
      const parsedSchema = z.object({
        generatedAt: z.string(),
        targetMomentsPerDay: z.number().int().min(1),
        days: z.array(z.string())
      });

      if (!notableMomentsPrompt?.output) {
        res.json({
          generatedAt: payload.generatedAt,
          status: notableMomentsPrompt?.status ?? "never",
          days: []
        });
        return;
      }

      const parsed = parsedSchema.parse(JSON.parse(notableMomentsPrompt.output));
      res.json({
        generatedAt: parsed.generatedAt,
        status: notableMomentsPrompt.status,
        targetMomentsPerDay: parsed.targetMomentsPerDay,
        days: parsed.days
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
