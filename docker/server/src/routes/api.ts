import { Router } from "express";
import { z } from "zod";
import type { AnalysisService } from "../services/analysisService.js";
import { serializeUnknownError, serverLogger } from "../utils/logging/serverLogger.js";
import type { LlmConnectivityStatus } from "../services/llmClient.js";
import type { StatsService } from "../services/statsService.js";
import type { TimeWindowSummaryService } from "../services/timeWindowSummaryService.js";
import { dayjs } from "../lib/dayjs.js";

export const createApiRouter = (
  analysisService: AnalysisService,
  getLlmConnectivityStatus: () => LlmConnectivityStatus,
  onIngestionComplete?: () => Promise<void>,
  getStatsService?: () => StatsService | null,
  getTimeWindowSummaryService?: () => TimeWindowSummaryService | null,
  onClearServerCaches?: () => Promise<void>
): Router => {
  const router = Router();
  const MAX_NOTABLE_UTTERANCES_LIMIT = 50;

  router.get("/health", (_req, res) => {
    res.json({ ok: true, llm: getLlmConnectivityStatus() });
  });

  router.post("/ingest", async (_req, res, next) => {
    try {
      serverLogger.info("Ingest endpoint invoked");
      if (onIngestionComplete) {
        await onIngestionComplete();
      }
      const dashboard = await analysisService.ingestAndAnalyze();
      serverLogger.info("Ingest endpoint completed", { generatedAt: dashboard.generatedAt, totalDays: dashboard.days.length });
      res.json(dashboard);
    } catch (error) {
      serverLogger.error("Ingest endpoint failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });

  router.get("/dashboard", (_req, res) => {
    res.json(analysisService.getCache());
  });

  router.get("/cache/inspect", (_req, res) => {
    const statsService = getStatsService?.();
    const timeWindowSummaryService = getTimeWindowSummaryService?.();

    res.json({
      generatedAt: new Date().toISOString(),
      analysis: analysisService.inspectCacheState(),
      stats: statsService ? statsService.inspectCaches() : null,
      rollingWindowSummary: timeWindowSummaryService ? timeWindowSummaryService.inspectCache() : null
    });
  });

  router.post("/cache/clear", async (_req, res, next) => {
    try {
      if (onClearServerCaches) {
        await onClearServerCaches();
      } else {
        analysisService.clearAnalysisCache();
      }

      res.status(202).json({
        accepted: true,
        status: "cleared"
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/timeline", (_req, res) => {
    const cache = analysisService.getCache();
    const timeline =
      cache?.days.map((day) => ({
        day: day.day,
        summary: day.summary,
        topics: day.topics.map((topic) => topic.title)
      })) ?? [];

    res.json(timeline);
  });

  router.get("/stats/summary", async (_req, res, next) => {
    try {
      serverLogger.info("Stats summary requested");
      const statsService = getStatsService?.();
      if (!statsService) {
        res.status(503).json({ message: "Stats DB is disabled. Enable TRANSCRIPTS_DB_ENABLED for database-backed stats." });
        return;
      }

      const payload = await statsService.getSummary();
      res.json(payload);
    } catch (error) {
      serverLogger.error("Stats summary request failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });

  router.get("/stats/channels/hourly", async (req, res, next) => {
    try {
      const query = z.object({ days: z.coerce.number().int().min(1).max(30).optional() }).parse(req.query);
      const statsService = getStatsService?.();
      if (!statsService) {
        res.status(503).json({ message: "Stats DB is disabled. Enable TRANSCRIPTS_DB_ENABLED for database-backed stats." });
        return;
      }

      const requestedDays = query.days ?? 7;
      const diagnostics = statsService.inspectHourlyRequest(requestedDays);
      const requestId = `hourly-stats-${dayjs().utc().format("YYYYMMDDTHHmmss")}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = dayjs().utc().toISOString();
      serverLogger.info("Hourly channel stats requested", {
        requestId,
        requestedAt: startedAt,
        endpoint: "/api/stats/channels/hourly",
        ...diagnostics
      });

      const payload = await statsService.getUtterancesPerHourPerChannel(requestedDays);
      serverLogger.info("Hourly channel stats response ready", {
        requestId,
        requestedAt: startedAt,
        completedAt: dayjs().utc().toISOString(),
        endpoint: "/api/stats/channels/hourly",
        ...diagnostics,
        rowsReturned: payload.length
      });
      res.json(payload);
    } catch (error) {
      serverLogger.error("Hourly channel stats request failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });

  router.get("/stats/daily-volume", async (req, res, next) => {
    try {
      const query = z.object({ days: z.coerce.number().int().min(1).max(30).optional() }).parse(req.query);
      serverLogger.info("Daily transcript volume requested", { days: query.days ?? "all" });
      const statsService = getStatsService?.();
      if (!statsService) {
        res.status(503).json({ message: "Stats DB is disabled. Enable TRANSCRIPTS_DB_ENABLED for database-backed stats." });
        return;
      }

      const payload = await statsService.getDailyVolume(query.days);
      res.json(payload);
    } catch (error) {
      serverLogger.error("Daily transcript volume request failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });

  router.get("/stats/channels/totals", async (_req, res, next) => {
    try {
      const statsService = getStatsService?.();
      if (!statsService) {
        res.status(503).json({ message: "Stats DB is disabled. Enable TRANSCRIPTS_DB_ENABLED for database-backed stats." });
        return;
      }

      const payload = await statsService.getChannelTotals();
      res.json(payload);
    } catch (error) {
      serverLogger.error("Channel totals request failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });


  router.get("/time-window-summary", async (req, res, next) => {
    try {
      const query = z.object({ hours: z.coerce.number().int().min(1).max(24) }).parse(req.query);
      const timeWindowSummaryService = getTimeWindowSummaryService?.();

      if (!timeWindowSummaryService) {
        res.status(503).json({
          message: "Time-window summaries require TRANSCRIPTS_DB_ENABLED and an initialized summary service."
        });
        return;
      }

      const payload = await timeWindowSummaryService.generate(query.hours);
      res.json(payload);
    } catch (error) {
      serverLogger.error("Time-window summary request failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });

  router.get("/topics/:topicTitle", (req, res) => {
    const topicTitle = decodeURIComponent(req.params.topicTitle).toLowerCase();
    const cache = analysisService.getCache();

    const details = cache?.days
      .flatMap((day) => day.topics.map((topic) => ({ ...topic, day })))
      .find((topic) => topic.title.toLowerCase() === topicTitle);

    if (!details) {
      res.status(404).json({ message: "Topic not found" });
      return;
    }

    res.json(details);
  });


  router.get("/notable-utterances", (req, res, next) => {
    try {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).optional(),
          days: z.coerce.number().int().min(1).max(30).optional()
        })
        .parse(req.query);

      const normalizedLimit = Math.min(query.limit ?? 10, MAX_NOTABLE_UTTERANCES_LIMIT);
      const payload = analysisService.getTopNotableUtterances(normalizedLimit, query.days ?? 7);
      res.json({
        totalUtterances: payload.length,
        limit: normalizedLimit,
        days: query.days ?? 7,
        utterances: payload
      });
    } catch (error) {
      next(error);
    }
  });


  router.get("/search/utterances", async (req, res, next) => {
    try {
      const query = z
        .object({
          q: z.string().trim().min(1),
          limit: z.coerce.number().int().min(1).max(40).optional(),
          channel: z.string().trim().min(1).max(200).optional()
        })
        .parse(req.query);

      const payload = await analysisService.searchUtterances(query.q, query.limit ?? 20, {
        channel: query.channel
      });
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/chat", async (req, res, next) => {
    try {
      const body = z
        .object({
          query: z.string().trim().min(1),
          mode: z.enum(["rag_chat", "llm_chat"]).optional(),
          channel: z.string().trim().min(1).max(200).optional()
        })
        .parse(req.body);
      const result = await analysisService.chat(body.query, body.mode ?? "rag_chat", {
        channel: body.channel
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
