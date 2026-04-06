import { Router } from "express";
import { z } from "zod";
import type { SystemLogsService } from "../services/systemLogsService.js";

export const createSystemLogsRouter = (systemLogsService: SystemLogsService): Router => {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const payload = await systemLogsService.listSystemLogs();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const params = z.object({ id: z.string().min(1) }).parse(req.params);
      const payload = await systemLogsService.getSystemLogById(params.id);

      if (!payload) {
        res.status(404).json({ message: "System log file not found" });
        return;
      }

      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
