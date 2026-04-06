import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { dayjs } from "./dayjs.js";
import { randomUUID } from "node:crypto";
import type { TranscriptUtterance } from "../types.js";

type IngestCsvDirectoryOptions = {
  onDirectoryRead?: (context: { directoryPath: string; totalFiles: number }) => void;
  onFileIngested?: (context: { file: string; rowsParsed: number; rowsAccepted: number; rowsSkipped: number }) => void;
  onIngestComplete?: (context: { totalFiles: number; totalRowsAccepted: number; totalRowsSkipped: number }) => void;
};

const parseDuration = (value: string): number => {
  const [mm, ss] = value.trim().split(":").map(Number);
  if (Number.isNaN(mm) || Number.isNaN(ss)) {
    return 0;
  }

  return mm * 60 + ss;
};

export const ingestCsvDirectory = async (directoryPath: string, options: IngestCsvDirectoryOptions = {}): Promise<TranscriptUtterance[]> => {
  const files = (await fs.readdir(directoryPath)).filter((file) => file.toLowerCase().endsWith(".csv"));
  const rows: TranscriptUtterance[] = [];
  let totalRowsSkipped = 0;

  options.onDirectoryRead?.({ directoryPath, totalFiles: files.length });

  for (const file of files) {
    const csvPath = path.join(directoryPath, file);
    const content = await fs.readFile(csvPath, "utf-8");
    const records: string[][] = parse(content, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: false
    });

    const dataRows = records.slice(1);
    let fileRowsAccepted = 0;
    let fileRowsSkipped = 0;

    for (const record of dataRows) {
      const [dateRaw = "", channel = "", duration = "", language = "", translated = "", text = "", filename = ""] = record;
      const parsedDate = dayjs(dateRaw).utc();

      if (!parsedDate.isValid()) {
        fileRowsSkipped += 1;
        continue;
      }

      fileRowsAccepted += 1;
      rows.push({
        id: randomUUID(),
        timestamp: parsedDate.toISOString(),
        day: parsedDate.format("YYYY-MM-DD"),
        hour: parsedDate.format("HH:00"),
        channel: channel.trim(),
        durationSec: parseDuration(duration),
        language: language.trim(),
        translated: translated.trim(),
        text: text.trim(),
        filename: filename.trim(),
        sourceFile: file
      });
    }

    totalRowsSkipped += fileRowsSkipped;
    options.onFileIngested?.({
      file,
      rowsParsed: dataRows.length,
      rowsAccepted: fileRowsAccepted,
      rowsSkipped: fileRowsSkipped
    });
  }

  rows.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  options.onIngestComplete?.({
    totalFiles: files.length,
    totalRowsAccepted: rows.length,
    totalRowsSkipped
  });

  return rows;
};
