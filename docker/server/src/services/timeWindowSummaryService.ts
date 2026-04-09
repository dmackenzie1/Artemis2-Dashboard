import { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import { dayjs } from "../lib/dayjs.js";
import { parseLlmJsonWithSchema } from "../lib/llmJson.js";
import type { LlmClient } from "./llmClient.js";
import { getPrompt } from "../lib/prompts.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { ExpiringCache } from "./expiringCache.js";

type EntityManagerProvider = () => EntityManager;
const rollingWindowFreshCacheTtlMs = 40 * 60 * 1000;
const rollingWindowStaleCacheTtlMs = 80 * 60 * 1000;

type TimeWindowUtteranceRow = {
  timestamp: string;
  channel: string;
  text: string;
  filename: string;
  sourceFile: string;
  wordCount: string;
};

type HourlySampleEntry = {
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

const anomalySignalPattern = /\b(abort|anomaly|warning|error|issue|off[-\s]?nominal|hold|scrub|fail(?:ed|ure)?|loss)\b/iu;

export const selectStratifiedHourlySample = (utterances: HourlySampleEntry[], maxSampleSize = 12): HourlySampleEntry[] => {
  if (utterances.length <= maxSampleSize) {
    return utterances;
  }

  const normalizedSampleSize = Math.max(Math.floor(maxSampleSize), 1);
  const selectedIndexes = new Set<number>();
  const maxIndex = utterances.length - 1;
  const channelCounts = utterances.reduce<Map<string, number>>((counts, utterance) => {
    const channel = utterance.channel.trim().toLowerCase();
    if (channel.length === 0) {
      return counts;
    }
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const addIndex = (index: number): void => {
    if (selectedIndexes.size >= normalizedSampleSize) {
      return;
    }
    selectedIndexes.add(Math.max(Math.min(index, maxIndex), 0));
  };

  addIndex(0);
  addIndex(Math.floor(maxIndex / 2));
  addIndex(maxIndex);

  for (const ratio of [0.2, 0.4, 0.6, 0.8]) {
    addIndex(Math.round(maxIndex * ratio));
  }

  const anomalyRankedIndexes = utterances
    .map((utterance, index) => {
      const channelKey = utterance.channel.trim().toLowerCase();
      const channelFrequency = channelKey.length > 0 ? (channelCounts.get(channelKey) ?? 1) : 1;
      const anomalySignalBonus = anomalySignalPattern.test(utterance.text) ? 200 : 0;
      const wordCount = Number(utterance.wordCount);
      const parsedWordCount = Number.isFinite(wordCount) ? wordCount : 0;
      const rarityBonus = Math.round(120 / channelFrequency);
      const score = anomalySignalBonus + parsedWordCount + rarityBonus;
      return { index, score, timestamp: utterance.timestamp };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.timestamp !== right.timestamp) {
        return left.timestamp.localeCompare(right.timestamp);
      }
      return left.index - right.index;
    })
    .map((entry) => entry.index);

  for (const index of anomalyRankedIndexes) {
    addIndex(index);
    if (selectedIndexes.size >= normalizedSampleSize) {
      break;
    }
  }

  if (selectedIndexes.size < normalizedSampleSize) {
    for (const index of utterances.keys()) {
      addIndex(index);
      if (selectedIndexes.size >= normalizedSampleSize) {
        break;
      }
    }
  }

  return [...selectedIndexes].sort((left, right) => left - right).map((index) => utterances[index]).filter(Boolean);
};


export class TimeWindowSummaryService {
  private readonly cache = new ExpiringCache<TimeWindowSummary>(rollingWindowFreshCacheTtlMs, rollingWindowStaleCacheTtlMs);
  private readonly refreshInFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly getEntityManager: EntityManagerProvider,
    private readonly llmClient: LlmClient,
    private readonly promptsDir: string
  ) {}

  async generate(hours: number): Promise<TimeWindowSummary> {
    const safeHours = Math.min(Math.max(Math.floor(hours), 1), 24);
    const cacheKey = `hours:${safeHours}`;
    const cached = this.cache.getWithStaleness(cacheKey);
    if (cached && !cached.isStale) {
      return cached.value;
    }
    if (cached && cached.isStale) {
      this.triggerBackgroundRefresh(cacheKey, safeHours);
      return cached.value;
    }

    return this.computeAndCacheWindowSummary(cacheKey, safeHours);
  }

  invalidateCache(): void {
    this.cache.clear();
  }

  inspectCache(): ReturnType<ExpiringCache<TimeWindowSummary>["inspect"]> {
    return this.cache.inspect();
  }

  private async computeAndCacheWindowSummary(cacheKey: string, safeHours: number): Promise<TimeWindowSummary> {
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
      sample: selectStratifiedHourlySample(utterances, 12).map((utterance) => ({
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

    const parsed = parseLlmJsonWithSchema(llmRaw, llmOutputSchema, "object");
    if (!parsed.ok) {
      serverLogger.warn("Time-window summary JSON contract validation failed", {
        componentId: `analysis/time-window/${safeHours}-hour`,
        expectedSchema: "TimeWindowSummaryLlmSchema",
        expectedRoot: "object",
        actualFormat: parsed.detectedFormat,
        reason: parsed.reason
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

  private triggerBackgroundRefresh(cacheKey: string, safeHours: number): void {
    if (this.refreshInFlight.has(cacheKey)) {
      return;
    }

    const refreshPromise = this.computeAndCacheWindowSummary(cacheKey, safeHours)
      .catch((error) => {
        serverLogger.warn("Background refresh failed for time-window summary", {
          cacheKey,
          safeHours,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      })
      .finally(() => {
        this.refreshInFlight.delete(cacheKey);
      });
    this.refreshInFlight.set(cacheKey, refreshPromise.then(() => undefined));
  }
}
