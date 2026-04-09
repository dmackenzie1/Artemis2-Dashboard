import { promises as fs } from "node:fs";
import path from "node:path";
import { dayjs } from "../lib/dayjs.js";
import lodash from "lodash";
import type { DashboardCache, DayInsights, NotableUtterance, TranscriptUtterance } from "../types.js";
import { getPrompt } from "../lib/prompts.js";
import { LlmClient } from "./llmClient.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { retrieveRankedUtterances } from "./transcriptRetrievalService.js";
import { ExpiringCache } from "./expiringCache.js";
import { parseLlmJsonWithSchema } from "../lib/llmJson.js";
import { z } from "zod";

const { groupBy, uniq } = lodash;

const notableSignalPattern = /\b(abort|risk|issue|anomaly|dropout|dropouts|fail|failure|fault|leak|warning|urgent|off-nominal|degraded|concern)\b/i;
const dailySummaryPlaceholder =
  "Daily summary pending pipeline generation. Trigger pipeline execution to populate the canonical summary.";
const hourlyPromptMaxUtterancesPerHour = 120;
const topicPromptMaxUtterancesPerWindow = 260;


const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);

const parseHourlyHighlights = (rawResponse: string): Record<string, string> => {
  const hourlySchema = z.record(z.string(), z.string());
  const parsed = parseLlmJsonWithSchema(rawResponse, hourlySchema, "object");

  if (!parsed.ok) {
    serverLogger.warn("Hourly summary response violated JSON contract", {
      componentId: "analysis/hourly_summary",
      expectedSchema: "Record<string, string>",
      expectedRoot: "object",
      actualFormat: parsed.detectedFormat,
      reason: parsed.reason
    });
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed.data)
      .map(([hour, summary]) => [hour.trim(), summary.trim()] as const)
      .filter(([hour, summary]) => hour.length > 0 && summary.length > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );
};

type ServiceConfig = {
  promptsDir: string;
  cacheFile: string;
  llmClient: LlmClient;
  llmMaxTokens: number;
  loadTranscriptUtterances: () => Promise<TranscriptUtterance[]>;
  loadTranscriptCandidates?: (
    query: string,
    options?: {
      channel?: string;
      candidateLimit?: number;
    }
  ) => Promise<TranscriptUtterance[]>;
  loadDailySummaryForDay?: (day: string) => Promise<string | null>;
};

type PromptUtterance = {
  timestamp: string;
  day: string;
  hour: string;
  channel: string;
  text: string;
};

type TopicWindow = {
  label: string;
  startHour: number;
  endHour: number;
  entries: TranscriptUtterance[];
};

export class AnalysisService {
  private utterances: TranscriptUtterance[] = [];
  private cache: DashboardCache | null = null;
  private isIngesting = false;
  private corpusVersion = "empty";
  private readonly searchCache = new ExpiringCache<{
    query: string;
    queryTokens: string[];
    totalUtterances: number;
    resultCount: number;
    utterances: ReturnType<typeof retrieveRankedUtterances>["ranked"];
  }>(2 * 60 * 1000);
  private readonly chatCache = new ExpiringCache<{
    answer: string;
    evidence: Array<{
      timestamp: string;
      day: string;
      channel: string;
      text: string;
      filename: string;
      source: string;
      score: number;
    }>;
    strategy: { mode: "rag_chat" | "llm_chat"; totalUtterances: number; contextUtterances: number; daysQueried: number };
  }>(2 * 60 * 1000);

  constructor(private readonly config: ServiceConfig) {}

  private toPromptUtterance(entry: TranscriptUtterance): PromptUtterance {
    return {
      timestamp: entry.timestamp,
      day: entry.day,
      hour: entry.hour,
      channel: entry.channel,
      text: entry.text
    };
  }

  private parseHourNumber(value: string): number {
    const hourSegment = value.split(":")[0] ?? "0";
    const parsed = Number.parseInt(hourSegment, 10);
    if (Number.isNaN(parsed)) {
      return 0;
    }

    return Math.max(0, Math.min(23, parsed));
  }

  private splitEntriesIntoTopicWindows(entries: TranscriptUtterance[]): TopicWindow[] {
    const firstHalf = entries.filter((entry) => this.parseHourNumber(entry.hour) <= 11);
    const secondHalf = entries.filter((entry) => this.parseHourNumber(entry.hour) >= 12);
    const windows: TopicWindow[] = [];

    if (firstHalf.length > 0) {
      windows.push({
        label: "00-11",
        startHour: 0,
        endHour: 11,
        entries: firstHalf
      });
    }

    if (secondHalf.length > 0) {
      windows.push({
        label: "12-23",
        startHour: 12,
        endHour: 23,
        entries: secondHalf
      });
    }

    if (windows.length > 0) {
      return windows;
    }

    return [
      {
        label: "00-23",
        startHour: 0,
        endHour: 23,
        entries
      }
    ];
  }

  private sampleEntriesForPrompt(entries: TranscriptUtterance[], maxEntries: number): TranscriptUtterance[] {
    if (entries.length <= maxEntries) {
      return entries;
    }

    const stride = Math.ceil(entries.length / maxEntries);
    const sampled = entries.filter((_, index) => index % stride === 0).slice(0, maxEntries);
    return sampled;
  }

  private hasPlaceholderDailySummaries(days: DayInsights[]): boolean {
    return days.some((day) => day.summary.trim() === dailySummaryPlaceholder);
  }

  private updateCorpusVersion(utterances: TranscriptUtterance[]): void {
    const latestTimestamp = utterances.length > 0 ? utterances[utterances.length - 1]?.timestamp ?? "none" : "none";
    this.corpusVersion = `${utterances.length}:${latestTimestamp}`;
  }

  private clearQueryCaches(): void {
    this.searchCache.clear();
    this.chatCache.clear();
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
      serverLogger.info("Loading transcript utterances from database", { step: "reading-from-database" });
      this.utterances = await this.config.loadTranscriptUtterances();
      this.updateCorpusVersion(this.utterances);
      this.clearQueryCaches();
      serverLogger.info("Transcript utterances loaded from database", {
        step: "done",
        utteranceCount: this.utterances.length,
        corpusVersion: this.corpusVersion
      });
      const byDay = groupBy(this.utterances, (item) => item.day);
      const dayKeys = Object.keys(byDay).sort();
      const days: DayInsights[] = [];

      for (const day of dayKeys) {
        const entries = byDay[day];
        const byHour = groupBy(entries, (item) => item.hour);
        const hourlyUtterances: Record<string, number> = {};
        const hourlyChannelLeads: Record<string, string[]> = {};

        for (const hour of Object.keys(byHour).sort()) {
          const hourEntries = byHour[hour];
          hourlyUtterances[hour] = hourEntries.length;
          const channelCounts = hourEntries.reduce<Map<string, number>>((counts, entry) => {
            const key = entry.channel.trim().length > 0 ? entry.channel.trim() : "UNKNOWN";
            counts.set(key, (counts.get(key) ?? 0) + 1);
            return counts;
          }, new Map<string, number>());

          hourlyChannelLeads[hour] = [...channelCounts.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 4)
            .map(([channel]) => channel);
        }

        const persistedDailySummary = this.config.loadDailySummaryForDay
          ? await this.config.loadDailySummaryForDay(day)
          : null;
        const dailySummary = persistedDailySummary ?? dailySummaryPlaceholder;

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
                utterances: this.sampleEntriesForPrompt(byHour[hour], hourlyPromptMaxUtterancesPerHour).map((entry) =>
                  this.toPromptUtterance(entry)
                )
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
        serverLogger.info("Prompting top topics", {
          day,
          utteranceCount: entries.length,
          windowingStrategy: "half-day"
        });
        const topicWindows = this.splitEntriesIntoTopicWindows(entries);
        const windowOutputs: Array<{ label: string; startHour: number; endHour: number; topicsRaw: string }> = [];

        for (const window of topicWindows) {
          const topicsRaw = await this.config.llmClient.generateText({
            systemPrompt: topicsPrompt,
            userPrompt: JSON.stringify({
              mode: "top-topics-window",
              day,
              window: {
                label: window.label,
                startHour: window.startHour,
                endHour: window.endHour
              },
              utteranceCount: window.entries.length,
              entries: this.sampleEntriesForPrompt(window.entries, topicPromptMaxUtterancesPerWindow).map((entry) =>
                this.toPromptUtterance(entry)
              )
            }),
            componentId: `analysis/top_topics/${day}/window/${window.label}`
          });
          windowOutputs.push({
            label: window.label,
            startHour: window.startHour,
            endHour: window.endHour,
            topicsRaw
          });
        }

        const topicsRaw = await this.config.llmClient.generateText({
          systemPrompt: topicsPrompt,
          userPrompt: JSON.stringify({
            mode: "top-topics-day-rollup",
            day,
            windows: windowOutputs.map((output) => ({
              label: output.label,
              startHour: output.startHour,
              endHour: output.endHour,
              topics: this.config.llmClient.parseTopics(output.topicsRaw)
            }))
          }),
          componentId: `analysis/top_topics/${day}/rollup`
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
            hourlyUtterances,
            hourlyChannelLeads
          }
        });
      }

      let missionSummary = "Mission summary deferred: one or more daily summaries are still pending pipeline generation.";
      if (this.hasPlaceholderDailySummaries(days)) {
        serverLogger.warn("Skipping mission overview summary generation due to incomplete upstream day summaries", {
          totalDays: days.length,
          pendingDayCount: days.filter((day) => day.summary.trim() === dailySummaryPlaceholder).length
        });
      } else {
        serverLogger.info("Prompting mission overview summary", { totalDays: days.length });
        missionSummary = await this.config.llmClient.generateText({
          systemPrompt: await getPrompt(this.config.promptsDir, "mission_summary.txt"),
          userPrompt: JSON.stringify({ days: days.map((day) => ({ day: day.day, summary: day.summary })) }),
          componentId: "analysis/mission_summary"
        });
        serverLogger.info("Prompt received for mission overview summary");
      }

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

  clearAnalysisCache(): void {
    this.cache = null;
    this.clearQueryCaches();
  }

  inspectCacheState(): {
    analysisCache: { generatedAt: string | null; dayCount: number };
    utteranceStore: { totalUtterances: number; dayCount: number; minDay: string | null; maxDay: string | null };
    retrieval: {
      corpusVersion: string;
      searchCache: ReturnType<ExpiringCache<unknown>["inspect"]>;
      chatCache: ReturnType<ExpiringCache<unknown>["inspect"]>;
    };
  } {
    const sortedDays = [...new Set(this.utterances.map((entry) => entry.day))].sort();
    return {
      analysisCache: {
        generatedAt: this.cache?.generatedAt ?? null,
        dayCount: this.cache?.days.length ?? 0
      },
      utteranceStore: {
        totalUtterances: this.utterances.length,
        dayCount: sortedDays.length,
        minDay: sortedDays[0] ?? null,
        maxDay: sortedDays[sortedDays.length - 1] ?? null
      },
      retrieval: {
        corpusVersion: this.corpusVersion,
        searchCache: this.searchCache.inspect(),
        chatCache: this.chatCache.inspect()
      }
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

  async searchUtterances(
    query: string,
    limit = 8,
    filters?: {
      channel?: string;
    }
  ): Promise<{
    query: string;
    queryTokens: string[];
    totalUtterances: number;
    resultCount: number;
    utterances: ReturnType<typeof retrieveRankedUtterances>["ranked"];
  }> {
    const normalizedChannel = filters?.channel?.trim().toLowerCase() ?? "";
    const normalizedLimit = Math.min(Math.max(limit, 1), 80);
    const cacheKey = `${this.corpusVersion}|${query.trim().toLowerCase()}|${normalizedLimit}|${normalizedChannel}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const filteredUtterances = this.config.loadTranscriptCandidates
      ? await this.config.loadTranscriptCandidates(query, {
          channel: normalizedChannel.length > 0 ? normalizedChannel : undefined,
          candidateLimit: 2000
        })
      : normalizedChannel.length > 0
        ? this.utterances.filter((entry) => entry.channel.trim().toLowerCase() === normalizedChannel)
        : this.utterances;
    const retrieval = retrieveRankedUtterances(query, filteredUtterances, normalizedLimit);

    const payload = {
      query,
      queryTokens: retrieval.queryTokens,
      totalUtterances: filteredUtterances.length,
      resultCount: retrieval.ranked.length,
      utterances: retrieval.ranked
    };
    this.searchCache.set(cacheKey, payload);
    return payload;
  }

  async chat(
    query: string,
    mode: "rag_chat" | "llm_chat" = "rag_chat",
    filters?: {
      channel?: string;
    }
  ): Promise<{
    answer: string;
    evidence: Array<{
      timestamp: string;
      day: string;
      channel: string;
      text: string;
      filename: string;
      source: string;
      score: number;
    }>;
    strategy: { mode: "rag_chat" | "llm_chat"; totalUtterances: number; contextUtterances: number; daysQueried: number };
  }> {
    serverLogger.info("Chat prompt requested", {
      queryLength: query.length,
      mode
    });

    const normalizedChannel = filters?.channel?.trim().toLowerCase() ?? "";
    const scopedUtterances = this.config.loadTranscriptCandidates
      ? await this.config.loadTranscriptCandidates(query, {
          channel: normalizedChannel.length > 0 ? normalizedChannel : undefined,
          candidateLimit: 2000
        })
      : normalizedChannel.length > 0
        ? this.utterances.filter((entry) => entry.channel.trim().toLowerCase() === normalizedChannel)
        : this.utterances;
    const totalUtterances = scopedUtterances.length;
    if (totalUtterances === 0) {
      return {
        answer: "No transcript evidence is currently loaded. Please run ingestion before querying chat.",
        evidence: [],
        strategy: { mode, totalUtterances: 0, contextUtterances: 0, daysQueried: 0 }
      };
    }

    const cacheKey = `${this.corpusVersion}|${mode}|${query.trim().toLowerCase()}|${normalizedChannel}`;
    const cached = this.chatCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const ragRetrieval = retrieveRankedUtterances(query, scopedUtterances, 40);
    const baseEvidence = ragRetrieval.ranked.map((entry) => ({
      ...entry
    }));
    const fallbackEvidence = scopedUtterances.slice(-40).map((entry) => ({
      timestamp: entry.timestamp,
      day: entry.day,
      channel: entry.channel,
      text: entry.text,
      filename: entry.filename,
      source: entry.sourceFile,
      score: 0
    }));
    const evidenceForPrompt = (baseEvidence.length > 0 ? baseEvidence : fallbackEvidence).slice(0, 40);
    const daysQueried = new Set(evidenceForPrompt.map((entry) => entry.day)).size;
    let answer = "";

    if (mode === "rag_chat") {
      const chatSystemPrompt = `You are an Artemis transcript analyst.
Use only provided evidence.
Cite timestamp and channel where possible.
If evidence is weak or missing, say you are uncertain and describe what is missing.
Return valid HTML fragments only using tags such as <h3>, <p>, <ul>, and <li>. Do not use Markdown.`;
      answer = await this.config.llmClient.generateText({
        systemPrompt: chatSystemPrompt,
        userPrompt: JSON.stringify({
          mode,
          query,
          queryTokens: ragRetrieval.queryTokens,
          evidence: evidenceForPrompt.slice(0, 12).map((entry) => ({
            timestamp: entry.timestamp,
            day: entry.day,
            channel: entry.channel,
            text: entry.text,
            score: entry.score
          }))
        }),
        componentId: `analysis/chat/${mode}`,
        cacheEnabled: false
      });
    } else {
      const perDayTokenBudget = Math.max(128, Math.floor(this.config.llmMaxTokens * 0.1));
      const perDayCharacterBudget = perDayTokenBudget * 4;
      const groupedByDay = new Map<string, typeof evidenceForPrompt>();
      for (const entry of evidenceForPrompt) {
        const bucket = groupedByDay.get(entry.day) ?? [];
        bucket.push(entry);
        groupedByDay.set(entry.day, bucket);
      }

      const latestTenDays = [...groupedByDay.keys()].sort().slice(-10);
      const dayPassages = await Promise.all(
        latestTenDays.map(async (day) => {
          const dayEntries = groupedByDay.get(day) ?? [];
          let remaining = perDayCharacterBudget;
          const lines: string[] = [];
          for (const entry of dayEntries) {
            const line = `[${entry.timestamp}] ${entry.channel}: ${entry.text}`;
            if (line.length > remaining) {
              break;
            }
            lines.push(line);
            remaining -= line.length;
          }

          const subResult = await this.config.llmClient.generateText({
            systemPrompt:
              "Identify transcript lines relevant to the user query for this single day. Return concise HTML using <h3>, <p>, <ul>, <li>.",
            userPrompt: JSON.stringify({
              mode,
              query,
              day,
              dayBudgetTokens: perDayTokenBudget,
              lines
            }),
            componentId: `analysis/chat/${mode}/day/${day}`,
            cacheEnabled: false
          });

          return {
            day,
            subResult
          };
        })
      );

      answer = await this.config.llmClient.generateText({
        systemPrompt:
          "Synthesize day-level findings into one mission response. Return valid HTML only (<h3>, <p>, <ul>, <li>) and call out uncertainty where evidence is thin.",
        userPrompt: JSON.stringify({
          mode,
          query,
          dayPassages
        }),
        componentId: `analysis/chat/${mode}/final`,
        cacheEnabled: false
      });
    }

    serverLogger.info("Chat prompt received", {
      mode,
      totalUtterances,
      contextUtterances: evidenceForPrompt.length,
      daysQueried
    });

    const payload = {
      answer,
      evidence: evidenceForPrompt,
      strategy: {
        mode,
        totalUtterances,
        contextUtterances: evidenceForPrompt.length,
        daysQueried
      }
    };
    this.chatCache.set(cacheKey, payload);
    return payload;
  }

}
