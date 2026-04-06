import { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import { dayjs } from "../lib/dayjs.js";
import type { LlmClient } from "./llmClient.js";
import { getPrompt } from "../lib/prompts.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { ExpiringCache } from "./expiringCache.js";

type EntityManagerProvider = () => EntityManager;
const rollingWindowCacheTtlMs = 3 * 60 * 1000;

type TimeWindowUtteranceRow = {
  timestamp: string;
  channel: string;
  text: string;
  filename: string;
  sourceFile: string;
  wordCount: string;
};

export type TimeWindowSummary = {
  generatedAt: string;
  window: {
    hours: number;
    start: string;
    end: string;
  };
  stats: {
    utterances: number;
    words: number;
    channels: number;
  };
  summary: string;
  highlights: Array<{
    hour: string;
    summary: string;
  }>;
};

const llmOutputSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(z.object({ hour: z.string().min(1), summary: z.string().min(1) })).default([])
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

export class TimeWindowSummaryService {
  private readonly cache = new ExpiringCache<TimeWindowSummary>(rollingWindowCacheTtlMs);

  constructor(
    private readonly getEntityManager: EntityManagerProvider,
    private readonly llmClient: LlmClient,
    private readonly promptsDir: string
  ) {}

  async generate(hours: number): Promise<TimeWindowSummary> {
    const safeHours = Math.min(Math.max(Math.floor(hours), 1), 24);
    const cacheKey = `hours:${safeHours}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const windowEnd = dayjs().utc();
    const windowStart = windowEnd.subtract(safeHours, "hour");

    const rows = await this.getEntityManager().getConnection().execute<TimeWindowUtteranceRow[]>(
      `
        select
          to_char(timestamp at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "timestamp",
          channel,
          text,
          filename,
          source_file as "sourceFile",
          word_count::text as "wordCount"
        from transcript_utterances
        where timestamp >= now() - (${safeHours} * interval '1 hour')
        order by timestamp asc
      `
    );

    const channels = new Set(rows.map((row) => row.channel.trim()).filter((channel) => channel.length > 0));
    const totals = {
      utterances: rows.length,
      words: rows.reduce((sum, row) => sum + Number(row.wordCount), 0),
      channels: channels.size
    };

    if (rows.length === 0) {
      const emptyPayload: TimeWindowSummary = {
        generatedAt: windowEnd.toISOString(),
        window: {
          hours: safeHours,
          start: windowStart.toISOString(),
          end: windowEnd.toISOString()
        },
        stats: totals,
        summary: `No transcript utterances were found in the last ${safeHours} hours.`,
        highlights: []
      };
      this.cache.set(cacheKey, emptyPayload);
      return emptyPayload;
    }

    const byHour = rows.reduce<Map<string, TimeWindowUtteranceRow[]>>((grouped, row) => {
      const hourKey = dayjs(row.timestamp).utc().format("YYYY-MM-DD HH:00");
      const entries = grouped.get(hourKey) ?? [];
      entries.push(row);
      grouped.set(hourKey, entries);
      return grouped;
    }, new Map<string, TimeWindowUtteranceRow[]>());

    const context = [...byHour.entries()].map(([hour, utterances]) => ({
      hour,
      utteranceCount: utterances.length,
      wordCount: utterances.reduce((sum, utterance) => sum + Number(utterance.wordCount), 0),
      channels: [...new Set(utterances.map((utterance) => utterance.channel).filter((channel) => channel.trim().length > 0))],
      sample: utterances.slice(0, 12).map((utterance) => ({
        timestamp: utterance.timestamp,
        channel: utterance.channel,
        text: utterance.text,
        filename: utterance.filename,
        sourceFile: utterance.sourceFile
      }))
    }));

    const systemPrompt = await getPrompt(this.promptsDir, "time_window_summary.txt");
    const llmRaw = await this.llmClient.generateText({
      systemPrompt,
      userPrompt: JSON.stringify(
        {
          window: {
            hours: safeHours,
            start: windowStart.toISOString(),
            end: windowEnd.toISOString()
          },
          stats: totals,
          promptGuidance:
            "Focus on what is new, currently changing, and operationally relevant in this exact rolling window. Prioritize recency and avoid retrospective mission-history narration.",
          hours: context
        },
        null,
        2
      ),
      componentId: `analysis/time-window/${safeHours}-hour`
    });

    const extractedJson = extractJsonObject(llmRaw);
    if (!extractedJson) {
      serverLogger.warn("Time-window summary output did not include parseable JSON; using fallback", {
        hours: safeHours
      });
      const fallbackPayload: TimeWindowSummary = {
        generatedAt: dayjs().utc().toISOString(),
        window: {
          hours: safeHours,
          start: windowStart.toISOString(),
          end: windowEnd.toISOString()
        },
        stats: totals,
        summary: llmRaw,
        highlights: context.map((entry) => ({ hour: entry.hour, summary: "No structured highlight generated." }))
      };
      this.cache.set(cacheKey, fallbackPayload);
      return fallbackPayload;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractedJson);
    } catch (error) {
      serverLogger.warn("Time-window summary JSON parse failed; using raw text", {
        hours: safeHours,
        error
      });
      const fallbackPayload: TimeWindowSummary = {
        generatedAt: dayjs().utc().toISOString(),
        window: {
          hours: safeHours,
          start: windowStart.toISOString(),
          end: windowEnd.toISOString()
        },
        stats: totals,
        summary: llmRaw,
        highlights: []
      };
      this.cache.set(cacheKey, fallbackPayload);
      return fallbackPayload;
    }

    const parsed = llmOutputSchema.safeParse(parsedJson);
    if (!parsed.success) {
      serverLogger.warn("Time-window summary JSON failed schema validation; using raw text", {
        hours: safeHours,
        issues: parsed.error.issues
      });
      const fallbackPayload: TimeWindowSummary = {
        generatedAt: dayjs().utc().toISOString(),
        window: {
          hours: safeHours,
          start: windowStart.toISOString(),
          end: windowEnd.toISOString()
        },
        stats: totals,
        summary: llmRaw,
        highlights: []
      };
      this.cache.set(cacheKey, fallbackPayload);
      return fallbackPayload;
    }

    const payload: TimeWindowSummary = {
      generatedAt: dayjs().utc().toISOString(),
      window: {
        hours: safeHours,
        start: windowStart.toISOString(),
        end: windowEnd.toISOString()
      },
      stats: totals,
      summary: parsed.data.summary,
      highlights: parsed.data.highlights
    };
    this.cache.set(cacheKey, payload);
    return payload;
  }
}
