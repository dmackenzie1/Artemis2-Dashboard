import path from "node:path";
import { dayjs } from "../../lib/dayjs.js";
import type { DailyDocumentGroup, DailyDocumentVariant, SourceContextDocument } from "./pipelineTypes.js";
import { dailySummaryChunkCharacterLimit, dailySummaryTargetWords } from "./pipelineTypes.js";

export class TranscriptContextBuilder {
  deriveDayKey(relativePath: string): string {
    const normalized = relativePath.toLowerCase();
    const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/u);
    if (dateMatch?.[1]) {
      return dateMatch[1];
    }

    const dayNumberMatch = normalized.match(/\bday[\s_-]?(\d{1,3})\b/u);
    if (dayNumberMatch?.[1]) {
      return `day-${dayNumberMatch[1].padStart(2, "0")}`;
    }

    return "unspecified-day";
  }

  derivePromptResponseDay(sourceContext: SourceContextDocument[]): string | null {
    if (sourceContext.length === 0) {
      return null;
    }

    const uniqueDays = Array.from(new Set(sourceContext.map((document) => this.deriveDayKey(document.path)))).filter(
      (day) => day !== "unspecified-day"
    );

    if (uniqueDays.length !== 1) {
      return null;
    }

    return uniqueDays[0] ?? null;
  }

  buildDailySummarySubmission(sourceContext: SourceContextDocument[]): string {
    const groupedDays = this.buildDailyGroups(sourceContext);

    const dayGroups = groupedDays.map((group) => ({
      day: group.day,
      sourceDocuments: group.documents.map((document) => ({
        path: document.path,
        checksum: document.checksum
      })),
      instructions: {
        minimumWordTarget: dailySummaryTargetWords.min,
        maximumWordTarget: dailySummaryTargetWords.max,
        objective:
          "Produce a detailed day-level summary that can be cached in the database and reused by mission-level summaries."
      }
    }));

    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        strategy: "daily-layer-first",
        chunking: {
          maxCharactersPerChunk: dailySummaryChunkCharacterLimit
        },
        dayGroups
      },
      null,
      2
    );
  }

  buildRecentChangesSubmission(sourceContext: SourceContextDocument[]): string {
    const groupedDays = this.buildDailyGroups(sourceContext);
    const latestWindowGroups = groupedDays.slice(-2);

    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        strategy: "rolling-24h-vs-prior-baseline",
        window: {
          latestDays: latestWindowGroups.length,
          targetRollingHours: 24
        },
        dayGroups: latestWindowGroups.map((group) => ({
          day: group.day,
          sourceDocuments: group.documents.map((document) => ({
            path: document.path,
            checksum: document.checksum,
            content: document.content
          }))
        }))
      },
      null,
      2
    );
  }

  buildNotableMomentsSubmission(
    sourceContext: SourceContextDocument[],
    baselineMomentsPerDay: number
  ): string {
    const groupedDays = this.buildDailyGroups(sourceContext);
    return JSON.stringify(
      {
        generatedAt: dayjs().utc().toISOString(),
        strategy: "daily-notable-moments",
        dayGroups: groupedDays.map((group) => ({
          day: group.day,
          sourceDocuments: group.documents.map((document) => ({
            path: document.path,
            checksum: document.checksum
          })),
          targetMoments: baselineMomentsPerDay
        }))
      },
      null,
      2
    );
  }

  splitDayDocumentsIntoChunks(documents: SourceContextDocument[]): SourceContextDocument[][] {
    const chunks: SourceContextDocument[][] = [];
    let currentChunk: SourceContextDocument[] = [];
    let currentCharacterCount = 0;

    for (const document of documents) {
      const documentCharacters = document.content.length;
      if (currentChunk.length > 0 && currentCharacterCount + documentCharacters > dailySummaryChunkCharacterLimit) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCharacterCount = 0;
      }

      if (documentCharacters > dailySummaryChunkCharacterLimit) {
        const parts = Math.max(Math.ceil(documentCharacters / dailySummaryChunkCharacterLimit), 1);
        const partSize = Math.ceil(documentCharacters / parts);

        for (let partIndex = 0; partIndex < parts; partIndex += 1) {
          const start = partIndex * partSize;
          const end = Math.min(start + partSize, documentCharacters);
          const partContent = document.content.slice(start, end);
          chunks.push([
            {
              ...document,
              path: `${document.path}#part-${partIndex + 1}`,
              content: partContent
            }
          ]);
        }
        continue;
      }

      currentChunk.push(document);
      currentCharacterCount += documentCharacters;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  filterSourceContextByDayKeys(sourceContext: SourceContextDocument[], dayKeys: Set<string>): SourceContextDocument[] {
    if (dayKeys.size === 0) {
      return sourceContext;
    }

    const filtered = sourceContext.filter((document) => dayKeys.has(this.deriveDayKey(document.path)));
    return filtered.length > 0 ? filtered : sourceContext;
  }

  buildDailyGroups(sourceContext: SourceContextDocument[]): DailyDocumentGroup[] {
    const groupedByDay = sourceContext.reduce<Map<string, SourceContextDocument[]>>((grouped, document) => {
      const dayKey = this.deriveDayKey(document.path);
      const documents = grouped.get(dayKey) ?? [];
      documents.push(document);
      grouped.set(dayKey, documents);
      return grouped;
    }, new Map<string, SourceContextDocument[]>());

    return [...groupedByDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, documents]) => ({ day, documents: this.resolveDailyGroupDocuments(documents) }));
  }

  private deriveDailyDocumentVariant(relativePath: string): DailyDocumentVariant {
    const parsedPath = path.parse(relativePath);
    const isPartial = /_partial$/iu.test(parsedPath.name);
    const canonicalName = isPartial ? parsedPath.name.replace(/_partial$/iu, "") : parsedPath.name;
    return {
      canonicalPath: path.join(parsedPath.dir, `${canonicalName}${parsedPath.ext}`),
      isPartial
    };
  }

  private resolveDailyGroupDocuments(documents: SourceContextDocument[]): SourceContextDocument[] {
    const preferredByCanonicalPath = documents.reduce<Map<string, SourceContextDocument>>((selected, document) => {
      const variant = this.deriveDailyDocumentVariant(document.path);
      const existing = selected.get(variant.canonicalPath);

      if (!existing) {
        selected.set(variant.canonicalPath, document);
        return selected;
      }

      const existingVariant = this.deriveDailyDocumentVariant(existing.path);
      if (existingVariant.isPartial && !variant.isPartial) {
        selected.set(variant.canonicalPath, document);
      }

      return selected;
    }, new Map<string, SourceContextDocument>());

    return [...preferredByCanonicalPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  }
}
