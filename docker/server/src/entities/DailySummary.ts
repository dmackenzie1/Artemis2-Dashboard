import { EntitySchema } from "@mikro-orm/core";

export class DailySummary {
  id!: number;
  day!: string;
  summary!: string;
  generatedAt!: Date;
  wordCount!: number;
  utteranceCount!: number;
  sourceDocumentCount!: number;
  updatedAt!: Date;
}

export const DailySummarySchema = new EntitySchema<DailySummary>({
  class: DailySummary,
  tableName: "daily_summaries",
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    day: { type: "string", length: 64, unique: true, index: true },
    summary: { type: "text" },
    generatedAt: { type: "datetime", index: true },
    wordCount: { type: "number" },
    utteranceCount: { type: "number" },
    sourceDocumentCount: { type: "number" },
    updatedAt: { type: "datetime", index: true }
  }
});
