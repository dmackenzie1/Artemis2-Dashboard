import { Router } from "express";
import { z } from "zod";
import type { AnalysisService } from "../services/analysisService.js";

export const createApiRouter = (analysisService: AnalysisService): Router => {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/ingest", async (_req, res, next) => {
    try {
      const dashboard = await analysisService.ingestAndAnalyze();
      res.json(dashboard);
    } catch (error) {
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

  router.post("/chat", async (req, res, next) => {
    try {
      const body = z.object({ query: z.string().min(1) }).parse(req.body);
      const result = await analysisService.chat(body.query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
