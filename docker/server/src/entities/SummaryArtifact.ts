import { EntitySchema } from "@mikro-orm/core";

export class SummaryArtifact {
  id!: number;
  summaryType!: string;
  day!: string;
  periodStart!: Date;
  periodEnd!: Date;
  channelGroup!: string;
  summary!: string;
  generatedAt!: Date;
  wordCount!: number;
  utteranceCount!: number;
  sourceDocumentCount!: number;
  sourceChecksum!: string;
  updatedAt!: Date;
}

export const SummaryArtifactSchema = new EntitySchema<SummaryArtifact>({
  class: SummaryArtifact,
  tableName: "summary_artifacts",
  uniques: [{ properties: ["summaryType", "periodStart", "periodEnd", "channelGroup"] }],
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    summaryType: { type: "string", length: 64, index: true },
    day: { type: "string", length: 64, index: true },
    periodStart: { type: "datetime", index: true },
    periodEnd: { type: "datetime", index: true },
    channelGroup: { type: "string", length: 128, index: true, default: "*" },
    summary: { type: "text" },
    generatedAt: { type: "datetime", index: true },
    wordCount: { type: "number" },
    utteranceCount: { type: "number" },
    sourceDocumentCount: { type: "number" },
    sourceChecksum: { type: "string", length: 64, index: true },
    updatedAt: { type: "datetime", index: true }
  }
});
