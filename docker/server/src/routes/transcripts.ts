import { Router } from "express";
import { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";

dayjs.extend(utc);

const querySchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  channel: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  format: z.enum(["json", "text"]).default("text")
});

export const createTranscriptRouter = (em: EntityManager): Router => {
  const router = Router();

  router.get("/context", async (req, res, next) => {
    try {
      const { start, end, channel, limit, format } = querySchema.parse(req.query);
      const where: {
        timestamp?: { $gte?: Date; $lte?: Date };
        channel?: string;
      } = {};

      if (start || end) {
        where.timestamp = {};

        if (start) {
          where.timestamp.$gte = dayjs(start).utc().toDate();
        }

        if (end) {
          where.timestamp.$lte = dayjs(end).utc().toDate();
        }
      }

      if (channel) {
        where.channel = channel;
      }

      const rows = await em.find(TranscriptUtterance, where, {
        orderBy: { timestamp: "asc" },
        limit
      });

      const formattedRows = rows.map((row) => {
        const isoTimestamp = dayjs(row.timestamp).utc().format("YYYY-MM-DDTHH:mm:ss[Z]");
        const formatted = `[${isoTimestamp}] ${row.channel}: ${row.text}`;

        return {
          timestamp: isoTimestamp,
          channel: row.channel,
          text: row.text,
          formatted,
          language: row.language,
          translated: row.translated,
          filename: row.filename,
          sourceFile: row.sourceFile
        };
      });

      if (format === "text") {
        res.type("text/plain").send(formattedRows.map((row) => row.formatted).join("\n"));
        return;
      }

      res.json(formattedRows);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
