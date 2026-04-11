import { EntitySchema } from "@mikro-orm/core";
import { dayjs } from "../lib/dayjs.js";

export class TranscriptUtterance {
  id!: number;
  timestamp!: Date;
  day!: string;
  channel!: string;
  durationSec!: number;
  wordCount!: number;
  tokens!: string[];
  language!: string;
  translated!: boolean;
  text!: string;
  audioFileName!: string;
  sourceFile!: string;

  static createFromCsvRow(row: {
    date: string;
    channel: string;
    duration: string;
    language: string;
    translated: string;
    text: string;
    audioFileName: string;
    sourceFile: string;
  }): Omit<TranscriptUtterance, "id"> | null {
    const parsedTimestamp = dayjs(row.date).utc();
    if (!parsedTimestamp.isValid()) {
      return null;
    }

    const [minutesRaw, secondsRaw] = row.duration.trim().split(":");
    const minutes = Number(minutesRaw);
    const seconds = Number(secondsRaw);
    const durationSec = Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : 0;
    const wordCount = row.text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    return {
      timestamp: parsedTimestamp.toDate(),
      day: parsedTimestamp.format("YYYY-MM-DD"),
      channel: row.channel.trim(),
      durationSec,
      wordCount,
      tokens: [],
      language: row.language.trim(),
      translated: row.translated.trim().toLowerCase() === "yes",
      text: row.text.trim(),
      audioFileName: row.audioFileName.trim(),
      sourceFile: row.sourceFile
    };
  }
}

export const TranscriptUtteranceSchema = new EntitySchema<TranscriptUtterance>({
  class: TranscriptUtterance,
  tableName: "transcript_utterances",
  indexes: [
    { properties: "tokens", type: "gin" },
    { properties: ["day", "timestamp"] }
  ],
  properties: {
    id: { type: "number", primary: true, autoincrement: true },
    timestamp: { type: "datetime", index: true },
    day: { type: "string", length: 10, index: true },
    channel: { type: "string", length: 200, index: true },
    durationSec: { type: "number" },
    wordCount: { type: "number" },
    tokens: { type: "array", nullable: false, defaultRaw: "'{}'" },
    language: { type: "string", length: 16 },
    translated: { type: "boolean" },
    text: { type: "text" },
    audioFileName: { type: "string", length: 255 },
    sourceFile: { type: "string", length: 255, index: true }
  }
});
