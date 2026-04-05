import { promises as fs } from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import lodash from "lodash";
import type { DashboardCache, DayInsights, NotableUtterance, TranscriptUtterance } from "../types.js";
import { ingestCsvDirectory } from "../lib/csvIngest.js";
import { getPrompt } from "../lib/prompts.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

dayjs.extend(utc);

const { groupBy, uniq } = lodash;


const notableSignalPattern = /\b(abort|risk|issue|anomaly|dropout|dropouts|fail|failure|fault|leak|warning|urgent|off-nominal|degraded|concern)\b/i;

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);

export type ChatMode = "rag" | "all";

type ServiceConfig = {
  dataDir: string;
  promptsDir: string;
  cacheFile: string;
  llmClient: LlmClient;
};

export class AnalysisService {
  private utterances: TranscriptUtterance[] = [];
  private cache: DashboardCache | null = null;

  constructor(private readonly config: ServiceConfig) {}

  async loadFromDisk(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.cacheFile, "utf-8");
      this.cache = JSON.parse(content) as DashboardCache;
    } catch {
      this.cache = null;
    }
  }

  async ingestAndAnalyze(): Promise<DashboardCache> {
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
    const byDay = groupBy(this.utterances, (item) => item.day);
    const dayKeys = Object.keys(byDay).sort();
    const days: DayInsights[] = [];

    for (const day of dayKeys) {
      const entries = byDay[day];
      const byHour = groupBy(entries, (item) => item.hour);
      const hourly: Record<string, string> = {};
      const hourlyUtterances: Record<string, number> = {};

      for (const hour of Object.keys(byHour).sort()) {
        hourlyUtterances[hour] = byHour[hour].length;
        hourly[hour] = "Hourly summary generation is disabled.";
      }

      const dailyPrompt = await getPrompt(this.config.promptsDir, "daily_summary.txt");
      serverLogger.info("Prompting daily summary", { day, sampleSize: Math.min(entries.length, 120) });
      const dailySummary = await this.config.llmClient.generateText({
        systemPrompt: dailyPrompt,
        userPrompt: JSON.stringify({ day, sample: entries.slice(0, 120) })
      });
      serverLogger.info("Prompt received for daily summary", { day });

      const topicsPrompt = await getPrompt(this.config.promptsDir, "top_topics.txt");
      serverLogger.info("Prompting top topics", { day, sampleSize: Math.min(entries.length, 120) });
      const topicsRaw = await this.config.llmClient.generateText({
        systemPrompt: topicsPrompt,
        userPrompt: JSON.stringify({ day, sample: entries.slice(0, 120) })
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
      userPrompt: JSON.stringify({ days: days.map((day) => ({ day: day.day, summary: day.summary })) })
    });
    serverLogger.info("Prompt received for mission overview summary");

    serverLogger.info("Prompting recent changes summary", { scopedDays: Math.min(days.length, 2) });
    const recentChanges = await this.config.llmClient.generateText({
      systemPrompt: await getPrompt(this.config.promptsDir, "recent_changes.txt"),
      userPrompt: JSON.stringify({ latestDays: days.slice(-2) })
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
  }

  getCache(): DashboardCache | null {
    return this.cache;
  }

  private getEvidenceForRag(query: string): TranscriptUtterance[] {
    const queryTokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ""))
      .filter((token) => token.length > 2);

    const scored = this.utterances
      .map((item) => {
        const haystack = `${item.channel} ${item.text}`.toLowerCase();
        const score = queryTokens.reduce((total, token) => (haystack.includes(token) ? total + 1 : total), 0);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 48)
      .map(({ item }) => item);

    if (scored.length > 0) {
      return scored;
    }

    return this.utterances.slice(0, 24);
  }

  private getEvidenceForBroadSweep(): { context: TranscriptUtterance[]; wasTruncated: boolean } {
    const MAX_CONTEXT = 400;
    if (this.utterances.length <= MAX_CONTEXT) {
      return { context: this.utterances, wasTruncated: false };
    }

    return {
      context: this.utterances.slice(-MAX_CONTEXT),
      wasTruncated: true
    };
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
      const uniqueTokens = new Set(tokenize(entry.text));
      for (const token of uniqueTokens) {
        tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
      }
    }

    const ranked = scoped.map((entry) => {
      const uniqueTokens = [...new Set(tokenize(entry.text))];
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
    evidence: TranscriptUtterance[];
    strategy: { mode: ChatMode; totalUtterances: number; contextUtterances: number; wasTruncated: boolean };
  }> {
    serverLogger.info("Chat prompt requested", {
      mode,
      queryLength: query.length
    });

    const ragEvidence = this.getEvidenceForRag(query);
    const sweepContext = this.getEvidenceForBroadSweep();

    const evidence = mode === "all" ? sweepContext.context : ragEvidence;
    const wasTruncated = mode === "all" ? sweepContext.wasTruncated : false;

    const answer = await this.config.llmClient.generateText({
      systemPrompt: await getPrompt(this.config.promptsDir, "chat_system.txt"),
      userPrompt: JSON.stringify({
        query,
        mode,
        totalUtterances: this.utterances.length,
        contextUtterances: evidence.length,
        evidence
      })
    });

    serverLogger.info("Chat prompt received", {
      mode,
      evidenceCount: evidence.length,
      wasTruncated
    });

    return {
      answer,
      evidence,
      strategy: {
        mode,
        totalUtterances: this.utterances.length,
        contextUtterances: evidence.length,
        wasTruncated
      }
    };
  }
}
