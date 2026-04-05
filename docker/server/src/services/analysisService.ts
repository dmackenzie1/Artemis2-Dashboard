import { promises as fs } from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { groupBy, uniq } from "lodash";
import type { DashboardCache, DayInsights, TranscriptUtterance } from "../types.js";
import { ingestCsvDirectory } from "../lib/csvIngest.js";
import { getPrompt } from "../lib/prompts.js";
import { LlmClient } from "./llmClient.js";

dayjs.extend(utc);

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
    this.utterances = await ingestCsvDirectory(this.config.dataDir);
    const byDay = groupBy(this.utterances, (item) => item.day);
    const dayKeys = Object.keys(byDay).sort();
    const days: DayInsights[] = [];

    for (const day of dayKeys) {
      const entries = byDay[day];
      const byHour = groupBy(entries, (item) => item.hour);
      const hourly: Record<string, string> = {};

      for (const hour of Object.keys(byHour).sort()) {
        const prompt = await getPrompt(this.config.promptsDir, "hourly_summary.txt");
        hourly[hour] = await this.config.llmClient.generateText({
          systemPrompt: prompt,
          userPrompt: JSON.stringify({ day, hour, sample: byHour[hour].slice(0, 40) })
        });
      }

      const dailyPrompt = await getPrompt(this.config.promptsDir, "daily_summary.txt");
      const dailySummary = await this.config.llmClient.generateText({
        systemPrompt: dailyPrompt,
        userPrompt: JSON.stringify({ day, sample: entries.slice(0, 120) })
      });

      const topicsPrompt = await getPrompt(this.config.promptsDir, "top_topics.txt");
      const topicsRaw = await this.config.llmClient.generateText({
        systemPrompt: topicsPrompt,
        userPrompt: JSON.stringify({ day, sample: entries.slice(0, 120) })
      });

      days.push({
        day,
        summary: dailySummary,
        hourly,
        topics: this.config.llmClient.parseTopics(topicsRaw),
        stats: {
          utteranceCount: entries.length,
          wordCount: entries.reduce((count, item) => count + item.text.split(/\s+/).length, 0),
          channelCount: uniq(entries.map((item) => item.channel)).length
        }
      });
    }

    const missionSummary = await this.config.llmClient.generateText({
      systemPrompt: await getPrompt(this.config.promptsDir, "mission_summary.txt"),
      userPrompt: JSON.stringify({ days: days.map((day) => ({ day: day.day, summary: day.summary })) })
    });

    const recentChanges = await this.config.llmClient.generateText({
      systemPrompt: await getPrompt(this.config.promptsDir, "recent_changes.txt"),
      userPrompt: JSON.stringify({ latestDays: days.slice(-2) })
    });

    this.cache = { generatedAt: dayjs().utc().toISOString(), missionSummary, recentChanges, days };

    await fs.mkdir(path.dirname(this.config.cacheFile), { recursive: true });
    await fs.writeFile(this.config.cacheFile, JSON.stringify(this.cache, null, 2), "utf8");

    return this.cache;
  }

  getCache(): DashboardCache | null {
    return this.cache;
  }

  async chat(query: string): Promise<{ answer: string; evidence: TranscriptUtterance[] }> {
    const lowered = query.toLowerCase();
    const evidence = this.utterances
      .filter((item) => item.text.toLowerCase().includes(lowered) || item.channel.toLowerCase().includes(lowered))
      .slice(0, 20);

    const answer = await this.config.llmClient.generateText({
      systemPrompt: await getPrompt(this.config.promptsDir, "chat_system.txt"),
      userPrompt: JSON.stringify({ query, evidence })
    });

    return { answer, evidence };
  }
}
