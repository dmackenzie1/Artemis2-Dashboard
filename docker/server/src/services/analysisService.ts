import { promises as fs } from "node:fs";
import path from "node:path";
import { dayjs } from "../lib/dayjs.js";
import lodash from "lodash";
import type { ChatEvidence, ChatMode, DashboardCache, DayInsights, NotableUtterance, TranscriptUtterance } from "../types.js";
import { ingestCsvDirectory } from "../lib/csvIngest.js";
import { getPrompt } from "../lib/prompts.js";
import { tokenizeQuery, tokenizeUtterance } from "../lib/tokenizer.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

const { groupBy, uniq } = lodash;

const notableSignalPattern = /\b(abort|risk|issue|anomaly|dropout|dropouts|fail|failure|fault|leak|warning|urgent|off-nominal|degraded|concern)\b/i;

const parseHourlyHighlights = (rawResponse: string): Record<string, string> => {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const entries = Object.entries(parsed)
      .filter(([hour, summary]) => typeof hour === "string" && typeof summary === "string")
      .map(([hour, summary]) => [hour.trim(), summary.trim()] as const)
      .filter(([hour, summary]) => hour.length > 0 && summary.length > 0)
      .sort(([left], [right]) => left.localeCompare(right));

    return Object.fromEntries(entries);
  } catch {
    const extracted = trimmed.match(/\{[\s\S]*\}/u)?.[0];
    if (!extracted) {
      return {};
    }

    try {
      const parsed = JSON.parse(extracted) as Record<string, string>;
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([hour, summary]) => typeof hour === "string" && typeof summary === "string")
          .sort(([left], [right]) => left.localeCompare(right))
      );
    } catch {
      return {};
    }
  }
};

type ServiceConfig = {
  dataDir: string;
  promptsDir: string;
  cacheFile: string;
  llmClient: LlmClient;
};

export class AnalysisService {
  private utterances: TranscriptUtterance[] = [];
  private cache: DashboardCache | null = null;
  private isIngesting = false;
  private tokenIndex = new Map<string, number[]>();
  private utteranceTokenCache = new Map<string, string[]>();

  constructor(private readonly config: ServiceConfig) {}

  private buildSearchIndex(): void {
    const nextIndex = new Map<string, number[]>();
    const nextTokenCache = new Map<string, string[]>();

    this.utterances.forEach((entry, index) => {
      const tokens = tokenizeUtterance(entry.text);
      nextTokenCache.set(entry.id, tokens);

      tokens.forEach((token) => {
        const bucket = nextIndex.get(token);
        if (bucket) {
          bucket.push(index);
          return;
        }

        nextIndex.set(token, [index]);
      });
    });

    this.tokenIndex = nextIndex;
    this.utteranceTokenCache = nextTokenCache;
  }

  private ensureSearchIndex(): void {
    if (this.utterances.length > 0 && this.utteranceTokenCache.size !== this.utterances.length) {
      this.buildSearchIndex();
    }
  }

  async loadFromDisk(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.cacheFile, "utf-8");
      this.cache = JSON.parse(content) as DashboardCache;
    } catch {
      this.cache = null;
    }
  }

  async ingestAndAnalyze(): Promise<DashboardCache> {
    if (this.isIngesting) {
      if (this.cache) {
        serverLogger.info("Ingestion already in progress, returning cache");
        return this.cache;
      }
      throw new Error("Ingestion already in progress and no cache available");
    }

    this.isIngesting = true;
    try {
      serverLogger.info("Starting CSV ingestion", { dataDir: this.config.dataDir });

      this.utterances = await ingestCsvDirectory(this.config.dataDir, {
        onDirectoryRead: ({ directoryPath, totalFiles }) => {
          serverLogger.info("CSV directory scanned", { directoryPath, totalFiles });
        },
        onFileIngested: ({ file, rowsParsed, rowsAccepted, rowsSkipped }) => {
          serverLogger.info("CSV file ingested", { file, rowsParsed, rowsAccepted, rowsSkipped });
        },
        onIngestComplete: ({ totalFiles, totalRowsAccepted, totalRowsSkipped }) => {
          serverLogger.info("CSV ingestion completed", { totalFiles, totalRowsAccepted, totalRowsSkipped });
        }
      });
      this.buildSearchIndex();

      const byDay = groupBy(this.utterances, (item) => item.day);
      const dayKeys = Object.keys(byDay).sort();
      const days: DayInsights[] = [];

      for (const day of dayKeys) {
        const entries = byDay[day];
        const byHour = groupBy(entries, (item) => item.hour);
        const hourlyUtterances: Record<string, number> = {};

        for (const hour of Object.keys(byHour).sort()) {
          hourlyUtterances[hour] = byHour[hour].length;
        }

        const dailyPrompt = await getPrompt(this.config.promptsDir, "daily_summary.txt");
        serverLogger.info("Prompting daily summary", { day, sampleSize: Math.min(entries.length, 120) });
        const dailySummary = await this.config.llmClient.generateText({
          systemPrompt: dailyPrompt,
          userPrompt: JSON.stringify({ day, sample: entries.slice(0, 120) }),
          componentId: `analysis/daily_summary/${day}`
        });
        serverLogger.info("Prompt received for daily summary", { day });

        const hourlyPrompt = await getPrompt(this.config.promptsDir, "hourly_summary.txt");
        serverLogger.info("Prompting hourly highlights", { day, hours: Object.keys(byHour).length });
        const hourlyRaw = await this.config.llmClient.generateText({
          systemPrompt: hourlyPrompt,
          userPrompt: JSON.stringify({
            day,
            hours: Object.keys(byHour)
              .sort()
              .map((hour) => ({
                hour,
                utteranceCount: byHour[hour].length,
                sample: byHour[hour].slice(0, 8)
              }))
          }),
          componentId: `analysis/hourly_summary/${day}`
        });
        serverLogger.info("Prompt received for hourly highlights", { day });

        const parsedHourly = parseHourlyHighlights(hourlyRaw);
        const hourly = Object.fromEntries(
          Object.keys(byHour)
            .sort()
            .map((hour) => [hour, parsedHourly[hour] ?? "No highlight generated for this hour."])
        );

        const topicsPrompt = await getPrompt(this.config.promptsDir, "top_topics.txt");
        serverLogger.info("Prompting top topics", { day, sampleSize: Math.min(entries.length, 120) });
        const topicsRaw = await this.config.llmClient.generateText({
          systemPrompt: topicsPrompt,
          userPrompt: JSON.stringify({ day, sample: entries.slice(0, 120) }),
          componentId: `analysis/top_topics/${day}`
        });
        serverLogger.info("Prompt received for top topics", { day });

        days.push({
          day,
          summary: dailySummary,
          hourly,
          topics: this.config.llmClient.parseTopics(topicsRaw),
          stats: {
            utteranceCount: entries.length,
            wordCount: entries.reduce((count, item) => count + item.text.split(/\s+/).length, 0),
            channelCount: uniq(entries.map((item) => item.channel)).length,
            hourlyUtterances
          }
        });
      }

      serverLogger.info("Prompting mission overview summary", { totalDays: days.length });
      const missionSummary = await this.config.llmClient.generateText({
        systemPrompt: await getPrompt(this.config.promptsDir, "mission_summary.txt"),
        userPrompt: JSON.stringify({ days: days.map((day) => ({ day: day.day, summary: day.summary })) }),
        componentId: "analysis/mission_summary"
      });
      serverLogger.info("Prompt received for mission overview summary");

      serverLogger.info("Prompting recent changes summary", { scopedDays: Math.min(days.length, 2) });
      const recentChanges = await this.config.llmClient.generateText({
        systemPrompt: await getPrompt(this.config.promptsDir, "recent_changes.txt"),
        userPrompt: JSON.stringify({ latestDays: days.slice(-2) }),
        componentId: "analysis/recent_changes"
      });
      serverLogger.info("Prompt received for recent changes summary");

      this.cache = { generatedAt: dayjs().utc().toISOString(), missionSummary, recentChanges, days };

      serverLogger.info("Analysis cache generated", {
        generatedAt: this.cache.generatedAt,
        totalDays: days.length,
        cacheFile: this.config.cacheFile
      });

      await fs.mkdir(path.dirname(this.config.cacheFile), { recursive: true });
      await fs.writeFile(this.config.cacheFile, JSON.stringify(this.cache, null, 2), "utf8");

      serverLogger.info("Analysis cache persisted", { cacheFile: this.config.cacheFile });

      return this.cache;
    } finally {
      this.isIngesting = false;
    }
  }

  getCache(): DashboardCache | null {
    return this.cache;
  }

  searchUtterances(query: string, limit = 120): ChatEvidence[] {
    this.ensureSearchIndex();

    if (this.utterances.length === 0) {
      return [];
    }

    const queryTokens = tokenizeQuery(query);
    if (queryTokens.length === 0) {
      return this.utterances.slice(-Math.min(limit, this.utterances.length)).map((entry) => ({ ...entry, score: 0 }));
    }

    const candidateIndexes = new Set<number>();
    queryTokens.forEach((token) => {
      const indexes = this.tokenIndex.get(token) ?? [];
      indexes.forEach((index) => candidateIndexes.add(index));
    });

    const ranked: ChatEvidence[] = [];
    const querySet = new Set(queryTokens);

    [...candidateIndexes].forEach((index) => {
      const entry = this.utterances[index];
      if (!entry) {
        return;
      }

      const entryTokens = this.utteranceTokenCache.get(entry.id) ?? [];
      const overlap = entryTokens.filter((token) => querySet.has(token)).length;
      if (overlap === 0) {
        return;
      }

      const queryCoverage = overlap / queryTokens.length;
      const entryCoverage = overlap / Math.max(entryTokens.length, 1);
      const phraseBonus = entry.text.toLowerCase().includes(query.toLowerCase()) ? 0.2 : 0;
      const score = Number((queryCoverage * 0.75 + entryCoverage * 0.25 + phraseBonus).toFixed(4));

      ranked.push({
        ...entry,
        score
      });
    });

    return ranked
      .sort((left, right) => right.score - left.score || right.timestamp.localeCompare(left.timestamp))
      .slice(0, Math.min(Math.max(limit, 1), 500));
  }

  getTopNotableUtterances(limit = 10, days = 7): NotableUtterance[] {
    if (this.utterances.length === 0) {
      return [];
    }

    const sortedDays = [...new Set(this.utterances.map((entry) => entry.day))].sort();
    const latestDay = sortedDays[sortedDays.length - 1];

    if (!latestDay) {
      return [];
    }

    const dayWindow = Math.max(days, 1);
    const cutoff = dayjs(latestDay).utc().subtract(dayWindow - 1, "day").format("YYYY-MM-DD");
    const scoped = this.utterances.filter((entry) => entry.day >= cutoff);

    if (scoped.length === 0) {
      return [];
    }

    const tokenFrequency = new Map<string, number>();

    for (const entry of scoped) {
      const uniqueTokens = new Set(tokenizeUtterance(entry.text));
      for (const token of uniqueTokens) {
        tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
      }
    }

    const ranked = scoped.map((entry) => {
      const uniqueTokens = [...new Set(tokenizeUtterance(entry.text))];
      const rarityScore = uniqueTokens.reduce((total, token) => total + 1 / Math.max(tokenFrequency.get(token) ?? 1, 1), 0);
      const normalizedRarity = rarityScore / Math.max(uniqueTokens.length, 1);
      const wordCount = entry.text.trim().split(/\s+/).filter(Boolean).length;
      const lengthScore = wordCount >= 6 && wordCount <= 60 ? 0.35 : 0;
      const signalScore = notableSignalPattern.test(entry.text) ? 0.8 : 0;
      const channelScore = /manager|flight|fdo|eec|eclss|gnc/i.test(entry.channel) ? 0.25 : 0;
      const recencyDays = Math.max(dayjs(latestDay).diff(dayjs(entry.day), "day"), 0);
      const recencyScore = Math.max(0, 1 - recencyDays / Math.max(dayWindow, 1)) * 0.25;
      const score = Number((normalizedRarity + lengthScore + signalScore + channelScore + recencyScore).toFixed(4));

      const reasons: string[] = [];
      if (signalScore > 0) {
        reasons.push("contains anomaly/risk signal terms");
      }
      if (normalizedRarity > 0.18) {
        reasons.push("highly specific wording vs weekly baseline");
      }
      if (channelScore > 0) {
        reasons.push("high-priority mission channel");
      }
      if (recencyScore > 0.18) {
        reasons.push("recent within selected window");
      }

      return {
        id: entry.id,
        timestamp: entry.timestamp,
        day: entry.day,
        channel: entry.channel,
        filename: entry.filename,
        text: entry.text,
        score,
        reasons: reasons.length > 0 ? reasons : ["high aggregate significance score"]
      };
    });

    return ranked
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.min(Math.max(limit, 1), 50));
  }

  async chat(
    query: string,
    mode: ChatMode = "rag"
  ): Promise<{
    answer: string;
    evidence: ChatEvidence[];
    strategy: { mode: "rag" | "all"; totalUtterances: number; contextUtterances: number; daysQueried: number };
  }> {
    serverLogger.info("Chat prompt requested", {
      queryLength: query.length,
      mode
    });

    const totalUtterances = this.utterances.length;
    const evidence = mode === "all" ? this.utterances.slice(-400).map((entry) => ({ ...entry, score: 0 })) : this.searchUtterances(query, 200);

    const answer = await this.config.llmClient.generateText({
      systemPrompt: await getPrompt(this.config.promptsDir, "chat_system.txt"),
      userPrompt: JSON.stringify({
        query,
        mode,
        totalUtterances,
        evidenceCount: evidence.length,
        evidence
      }),
      componentId: `analysis/chat/${mode}`
    });

    const daysQueried = new Set(evidence.map((entry) => entry.day)).size;

    serverLogger.info("Chat prompt received", {
      mode,
      daysQueried,
      evidenceCount: evidence.length,
      totalUtterances
    });

    return {
      answer,
      evidence,
      strategy: {
        mode,
        totalUtterances,
        contextUtterances: evidence.length,
        daysQueried
      }
    };
  }
}
