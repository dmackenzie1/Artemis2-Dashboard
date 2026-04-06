import { Router } from "express";
import { z } from "zod";
import type { AnalysisService } from "../services/analysisService.js";
import { serializeUnknownError, serverLogger } from "../utils/logging/serverLogger.js";
import type { LlmConnectivityStatus } from "../services/llmClient.js";
import type { StatsService } from "../services/statsService.js";
import type { TimeWindowSummaryService } from "../services/timeWindowSummaryService.js";

export const createApiRouter = (
  analysisService: AnalysisService,
  getLlmConnectivityStatus: () => LlmConnectivityStatus,
  onIngestionComplete?: () => Promise<void>,
  getStatsService?: () => StatsService | null,
  getTimeWindowSummaryService?: () => TimeWindowSummaryService | null
): Router => {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, llm: getLlmConnectivityStatus() });
  });

  router.post("/ingest", async (_req, res, next) => {
    try {
      serverLogger.info("Ingest endpoint invoked");
      const dashboard = await analysisService.ingestAndAnalyze();
      if (onIngestionComplete) {
        await onIngestionComplete();
      }
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

  router.get("/stats", (_req, res) => {
    const cache = analysisService.getCache();
    const stats =
      cache?.days.map((day) => ({
        day: day.day,
        utterances: day.stats.utteranceCount,
        words: day.stats.wordCount,
        channels: day.stats.channelCount
      })) ?? [];

    res.json(stats);
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

  router.get("/stats/days", async (_req, res, next) => {
    try {
      serverLogger.info("Daily stats requested");
      const statsService = getStatsService?.();
      if (!statsService) {
        res.status(503).json({ message: "Stats DB is disabled. Enable TRANSCRIPTS_DB_ENABLED for database-backed stats." });
        return;
      }

      const payload = await statsService.getStatsByDay();
      res.json(payload);
    } catch (error) {
      serverLogger.error("Daily stats request failed", { error: serializeUnknownError(error) });
      next(error);
    }
  });

  router.get("/stats/channels/hourly", async (req, res, next) => {
    try {
      const query = z.object({ days: z.coerce.number().int().min(1).max(30).optional() }).parse(req.query);
      serverLogger.info("Hourly channel stats requested", { days: query.days ?? 7 });
      const statsService = getStatsService?.();
      if (!statsService) {
        res.status(503).json({ message: "Stats DB is disabled. Enable TRANSCRIPTS_DB_ENABLED for database-backed stats." });
        return;
      }

      const payload = await statsService.getUtterancesPerHourPerChannel(query.days ?? 7);
      res.json(payload);
    } catch (error) {
      serverLogger.error("Hourly channel stats request failed", { error: serializeUnknownError(error) });
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
          limit: z.coerce.number().int().min(1).max(50).optional(),
          days: z.coerce.number().int().min(1).max(30).optional()
        })
        .parse(req.query);

      const payload = analysisService.getTopNotableUtterances(query.limit ?? 10, query.days ?? 7);
      res.json({
        totalUtterances: payload.length,
        limit: query.limit ?? 10,
        days: query.days ?? 7,
        utterances: payload
      });
    } catch (error) {
      next(error);
    }
  });


  router.get("/search/utterances", (req, res, next) => {
    try {
      const query = z
        .object({
          q: z.string().trim().min(1),
          limit: z.coerce.number().int().min(1).max(25).optional()
        })
        .parse(req.query);

      const payload = analysisService.searchUtterances(query.q, query.limit ?? 8);
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
          mode: z.enum(["rag", "all"]).optional()
        })
        .parse(req.body);
      const result = await analysisService.chat(body.query, body.mode ?? "all");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
