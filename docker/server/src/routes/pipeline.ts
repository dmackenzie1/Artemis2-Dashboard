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
  // Strip code-fenced blocks with or without a language label (```json...``` or ```...```).
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/iu);
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

// Attempt to parse a single day's notable moments output from the LLM.
// The `dayHint` is used as a fallback `day` value when the LLM returns a
// bare array (i.e. the moments list without the outer day wrapper object).
const parseNotableMomentsDay = (
  rawDay: unknown,
  dayHint?: string
): z.infer<typeof notableMomentsDaySchema> | null => {
  // 1. Already an object — try to validate it directly.
  if (typeof rawDay === "object" && rawDay !== null) {
    // Handle a bare array: [{rank, title, ...}, ...]
    if (Array.isArray(rawDay) && dayHint) {
      const wrapped = notableMomentsDaySchema.safeParse({ day: dayHint, moments: rawDay });
      return wrapped.success ? wrapped.data : null;
    }
    const parsed = notableMomentsDaySchema.safeParse(rawDay);
    return parsed.success ? parsed.data : null;
  }

  if (typeof rawDay !== "string") {
    return null;
  }

  // 2. Try direct JSON.parse then validate.
  const directParsed = (() => {
    try {
      return JSON.parse(rawDay) as unknown;
    } catch (_error) {
      return null;
    }
  })();

  if (directParsed !== null) {
    // Handle bare array from direct parse.
    if (Array.isArray(directParsed) && dayHint) {
      const wrapped = notableMomentsDaySchema.safeParse({ day: dayHint, moments: directParsed });
      if (wrapped.success) {
        return wrapped.data;
      }
    }
    const directSchema = notableMomentsDaySchema.safeParse(directParsed);
    if (directSchema.success) {
      return directSchema.data;
    }
  }

  // 3. Try extracting JSON from a fenced or wrapped string.
  const extractedJson = extractJsonObject(rawDay);
  if (!extractedJson) {
    return null;
  }

  try {
    const extractedValue = JSON.parse(extractedJson) as unknown;
    if (Array.isArray(extractedValue) && dayHint) {
      const wrapped = notableMomentsDaySchema.safeParse({ day: dayHint, moments: extractedValue });
      if (wrapped.success) {
        return wrapped.data;
      }
    }
    const extractedParsed = notableMomentsDaySchema.safeParse(extractedValue);
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

  router.get("/prompt-matrix-state", async (req, res, next) => {
    try {
      const query = z
        .object({
          days: z.coerce.number().int().min(1).max(20).optional()
        })
        .parse(req.query);
      const payload = await pipelineService.getPromptMatrixState(query.days ?? 11);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/summaries", async (req, res, next) => {
    try {
      const query = z
        .object({
          summaryType: z.string().trim().min(1).max(64).optional(),
          day: z.string().trim().min(1).max(64).optional(),
          channelGroup: z.string().trim().min(1).max(128).optional()
        })
        .parse(req.query);
      const payload = await pipelineService.getSummaries({
        summaryType: query.summaryType,
        day: query.day,
        channelGroup: query.channelGroup
      });
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/summaries/catalog", async (_req, res, next) => {
    try {
      const payload = await pipelineService.getSummariesCatalog();
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
      const executions = await pipelineService.getLatestPromptExecutionsByDay("notable_moments", 20);
      if (executions.length === 0) {
        res.json({
          generatedAt: new Date().toISOString(),
          status: "never",
          days: [],
          parsedDayCount: 0,
          droppedDayCount: 0
        });
        return;
      }

      const normalizedDays = executions
        .filter((execution) => execution.status === "success" && execution.output.trim().length > 0)
        .map((execution) => parseNotableMomentsDay(execution.output, execution.responseDay ?? undefined))
        .filter((entry): entry is z.infer<typeof notableMomentsDaySchema> => Boolean(entry));
      const droppedDayCount = Math.max(executions.length - normalizedDays.length, 0);
      const hasFailure = executions.some((execution) => execution.status === "failed");
      const hasRunning = executions.some((execution) => execution.status === "running");
      const status: "running" | "success" | "failed" | "never" = hasFailure ? "failed" : hasRunning ? "running" : "success";

      if (droppedDayCount > 0) {
        serverLogger.warn("Dropped unparsable notable moments day payload(s)", {
          totalDays: executions.length,
          parsedDayCount: normalizedDays.length,
          droppedDayCount
        });
      }

      res.json({
        generatedAt: new Date().toISOString(),
        status,
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
