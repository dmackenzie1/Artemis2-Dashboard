import { Router } from "express";
import type { PipelineService } from "../services/pipelineService.js";

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
      await pipelineService.runPipelineCycle();
      const dashboard = await pipelineService.getDashboardView();
      res.json(dashboard);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
