import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { EntityManager } from "@mikro-orm/postgresql";
import { parse } from "csv-parse";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

type CsvRow = {
  Date: string;
  Channel: string;
  Duration: string;
  Language: string;
  Translated: string;
  Text: string;
  Filename: string;
};

type IngestFileResult = {
  inserted: number;
  skipped: number;
};

export type TranscriptIngestionSummary = {
  filesProcessed: number;
  inserted: number;
  skipped: number;
  utterancesInDatabase: number;
};

const BATCH_SIZE = 750;

const ingestFile = async (filePath: string, em: EntityManager): Promise<IngestFileResult> => {
  const sourceFile = path.basename(filePath);
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: false,
      relax_column_count: true,
      relax_quotes: true
    })
  );

  let inserted = 0;
  let skipped = 0;
  let batch: Array<Omit<TranscriptUtterance, "id">> = [];

  for await (const row of parser as AsyncIterable<CsvRow>) {
    const entity = TranscriptUtterance.createFromCsvRow({
      date: row.Date ?? "",
      channel: row.Channel ?? "",
      duration: row.Duration ?? "",
      language: row.Language ?? "",
      translated: row.Translated ?? "",
      text: row.Text ?? "",
      filename: row.Filename ?? "",
      sourceFile
    });

    if (!entity) {
      skipped += 1;
      continue;
    }

    batch.push(entity);

    if (batch.length >= BATCH_SIZE) {
      await em.insertMany(TranscriptUtterance, batch);
      inserted += batch.length;
      serverLogger.info("Inserted transcript batch into database", {
        sourceFile,
        insertedRows: batch.length,
        insertedSoFar: inserted
      });
      batch = [];
    }
  }

  if (batch.length > 0) {
    await em.insertMany(TranscriptUtterance, batch);
    inserted += batch.length;
    serverLogger.info("Inserted transcript batch into database", {
      sourceFile,
      insertedRows: batch.length,
      insertedSoFar: inserted
    });
  }

  return { inserted, skipped };
};

export const ingestTranscriptCsvDirectory = async (transcriptCsvDir: string, em: EntityManager): Promise<TranscriptIngestionSummary> => {
  const files = (await fs.readdir(transcriptCsvDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
    .sort();

  await em.nativeDelete(TranscriptUtterance, {});

  let inserted = 0;
  let skipped = 0;
  for (const fileName of files) {
    const filePath = path.join(transcriptCsvDir, fileName);
    const result = await ingestFile(filePath, em);
    inserted += result.inserted;
    skipped += result.skipped;
    serverLogger.info("Inserted records from transcript file", {
      fileName,
      insertedRecords: result.inserted,
      skippedRecords: result.skipped,
      totalInserted: inserted
    });
  }

  const utterancesInDatabase = await em.count(TranscriptUtterance, {});
  return {
    filesProcessed: files.length,
    inserted,
    skipped,
    utterancesInDatabase
  };
};
