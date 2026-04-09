import { Router } from "express";
import { z } from "zod";
import type { PipelineService } from "../services/pipelineService.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { liveUpdateBus } from "../services/liveUpdateBus.js";

const notableMomentSchema = z.object({
  rank: z.coerce.number().int().min(1),
  title: z.string(),
  quote: z.string(),
  reason: z.string(),
  timestamp: z.string().nullable(),
  channel: z.string().nullable(),
  sourcePath: z.string()
});

const notableMomentsDaySchema = z.object({
  day: z.string().min(1),
  moments: z.array(notableMomentSchema)
});

const extractJsonObject = (raw: string): string | null => {
  const fencedMatch = raw.match(/```json\s*([\s\S]*?)```/iu);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return null;
};

const parseNotableMomentsDay = (rawDay: unknown): z.infer<typeof notableMomentsDaySchema> | null => {
  if (typeof rawDay === "object" && rawDay !== null) {
    const parsed = notableMomentsDaySchema.safeParse(rawDay);
    return parsed.success ? parsed.data : null;
  }

  if (typeof rawDay !== "string") {
    return null;
  }

  const directParse = notableMomentsDaySchema.safeParse((() => {
    try {
      return JSON.parse(rawDay) as unknown;
    } catch (_error) {
      return null;
    }
  })());
  if (directParse.success) {
    return directParse.data;
  }

  const extractedJson = extractJsonObject(rawDay);
  if (!extractedJson) {
    return null;
  }

  try {
    const extractedParsed = notableMomentsDaySchema.safeParse(JSON.parse(extractedJson) as unknown);
    return extractedParsed.success ? extractedParsed.data : null;
  } catch (_error) {
    return null;
  }
};

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

  router.get("/daily-summaries", async (req, res, next) => {
    try {
      const query = z
        .object({
          channelGroup: z.string().trim().min(1).max(128).optional()
        })
        .parse(req.query);
      const payload = await pipelineService.getDailySummaries(query.channelGroup ?? "*");
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/run", async (_req, res, next) => {
    try {
      const wasAlreadyRunning = pipelineService.isPipelineRunInProgress();
      if (!wasAlreadyRunning) {
        liveUpdateBus.publish({ type: "pipeline.run.started", payload: { trigger: "manual:/api/pipeline/run" } });
        void pipelineService.runPipelineCycle().then(() => {
          liveUpdateBus.publish({ type: "pipeline.run.completed", payload: { trigger: "manual:/api/pipeline/run" } });
        }).catch((error: unknown) => {
          liveUpdateBus.publish({
            type: "pipeline.run.failed",
            payload: { trigger: "manual:/api/pipeline/run", error: error instanceof Error ? error.message : "Unknown error" }
          });
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
          days: [],
          parsedDayCount: 0,
          droppedDayCount: 0
        });
        return;
      }

      const parsed = parsedSchema.parse(JSON.parse(notableMomentsPrompt.output));
      const normalizedDays = parsed.days
        .map((rawDay) => parseNotableMomentsDay(rawDay))
        .filter((entry): entry is z.infer<typeof notableMomentsDaySchema> => Boolean(entry));
      const droppedDayCount = Math.max(parsed.days.length - normalizedDays.length, 0);

      if (droppedDayCount > 0) {
        serverLogger.warn("Dropped unparsable notable moments day payload(s)", {
          totalDays: parsed.days.length,
          parsedDayCount: normalizedDays.length,
          droppedDayCount
        });
      }

      res.json({
        generatedAt: parsed.generatedAt,
        status: notableMomentsPrompt.status,
        targetMomentsPerDay: parsed.targetMomentsPerDay,
        days: normalizedDays,
        parsedDayCount: normalizedDays.length,
        droppedDayCount
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
