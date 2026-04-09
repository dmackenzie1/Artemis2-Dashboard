import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { EntityManager } from "@mikro-orm/postgresql";
import { parse, type CsvError, type Info } from "csv-parse";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { tokenizeUtterance } from "../lib/tokenizer.js";
import { compareTranscriptFiles, parseTranscriptFileName } from "../lib/transcriptFileNaming.js";
import { dayjs } from "../lib/dayjs.js";

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
  parseErrors: number;
};

export type TranscriptIngestionSummary = {
  filesProcessed: number;
  inserted: number;
  skipped: number;
  parseErrors: number;
  utterancesInDatabase: number;
};

const BATCH_SIZE = 750;

type TimestampValidationState = {
  mismatchedDayRows: number;
  outOfRangeHourRows: number;
};

const ingestFile = async (filePath: string, em: EntityManager): Promise<IngestFileResult> => {
  const sourceFile = path.basename(filePath);
  const parsedSourceFile = parseTranscriptFileName(sourceFile);
  let parseErrors = 0;
  const validationState: TimestampValidationState = {
    mismatchedDayRows: 0,
    outOfRangeHourRows: 0
  };

  if (!parsedSourceFile) {
    serverLogger.warn("Transcript source file name does not match expected day-prefixed naming", {
      sourceFile,
      expectedExamples: [
        "2026-04-09_summary.csv",
        "2026-04-09_partial_1.csv",
        "2026-04-09_00-06.csv"
      ]
    });
  }

  serverLogger.info("Starting transcript file ingest", {
    sourceFile,
    parsedSourceFile,
    step: "reading-file"
  });
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: false,
      relax_column_count: true,
      relax_quotes: true,
      info: true,
      skip_records_with_error: true,
      on_skip: (error: CsvError | undefined): undefined => {
        parseErrors += 1;
        serverLogger.warn("Skipped malformed CSV record while ingesting transcripts", {
          sourceFile,
          parserCode: error?.code,
          parserMessage: error?.message,
          line: error?.lines ?? null,
          record: error?.records ?? null
        });
        return undefined;
      }
    })
  );

  let inserted = 0;
  let skipped = 0;
  let tokenized = 0;
  let batch: Array<Omit<TranscriptUtterance, "id">> = [];
  serverLogger.info("Beginning transcript tokenization for file", {
    sourceFile,
    step: "tokenizing"
  });

  for await (const parsed of parser as AsyncIterable<{ record: CsvRow; info: Info }>) {
    const { record: row, info } = parsed;
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
      serverLogger.warn("Skipped CSV record with invalid date while ingesting transcripts", {
        sourceFile,
        line: info.lines,
        date: row.Date ?? ""
      });
      continue;
    }

    if (parsedSourceFile) {
      const rowDay = dayjs(entity.timestamp).utc().format("YYYY-MM-DD");
      if (rowDay !== parsedSourceFile.day) {
        validationState.mismatchedDayRows += 1;
        serverLogger.warn("Transcript row day does not match source file day", {
          sourceFile,
          expectedDay: parsedSourceFile.day,
          actualDay: rowDay,
          line: info.lines,
          timestamp: dayjs(entity.timestamp).utc().toISOString()
        });
      }

      if (parsedSourceFile.kind === "hour-range") {
        const hour = Number.parseInt(dayjs(entity.timestamp).utc().format("HH"), 10);
        const hourStart = parsedSourceFile.hourStart ?? 0;
        const hourEnd = parsedSourceFile.hourEnd ?? 23;
        if (hour < hourStart || hour > hourEnd) {
          validationState.outOfRangeHourRows += 1;
          serverLogger.warn("Transcript row hour outside hour-range source file bucket", {
            sourceFile,
            line: info.lines,
            hour,
            expectedHourStart: hourStart,
            expectedHourEnd: hourEnd,
            timestamp: dayjs(entity.timestamp).utc().toISOString()
          });
        }
      }
    }

    const tokens = tokenizeUtterance(entity.text);
    tokenized += 1;

    batch.push({
      ...entity,
      tokens
    });

    if (batch.length >= BATCH_SIZE) {
      serverLogger.info("Persisting transcript batch", {
        sourceFile,
        step: "inserting-into-database",
        batchSize: batch.length
      });
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
    serverLogger.info("Persisting transcript batch", {
      sourceFile,
      step: "inserting-into-database",
      batchSize: batch.length
    });
    await em.insertMany(TranscriptUtterance, batch);
    inserted += batch.length;
    serverLogger.info("Inserted transcript batch into database", {
      sourceFile,
      insertedRows: batch.length,
      insertedSoFar: inserted
    });
  }

  serverLogger.info("Completed transcript file ingest", {
    sourceFile,
    step: "done",
    inserted,
    tokenized,
    skipped,
    parseErrors,
    timestampValidation: validationState
  });

  return { inserted, skipped, parseErrors };
};

const logOverlapWarnings = (fileNames: string[]): void => {
  const groupedByDay = fileNames.reduce<Map<string, string[]>>((grouped, fileName) => {
    const parsed = parseTranscriptFileName(fileName);
    if (!parsed) {
      return grouped;
    }

    const existing = grouped.get(parsed.day) ?? [];
    existing.push(fileName);
    grouped.set(parsed.day, existing);
    return grouped;
  }, new Map<string, string[]>());

  for (const [day, dayFileNames] of groupedByDay.entries()) {
    const parsed = dayFileNames
      .map((fileName) => parseTranscriptFileName(fileName))
      .filter((descriptor): descriptor is NonNullable<typeof descriptor> => Boolean(descriptor));

    const fullDayFiles = parsed.filter((descriptor) => descriptor.kind === "full-day");
    if (fullDayFiles.length > 1) {
      serverLogger.warn("Duplicate full-day transcript files detected for a single day", {
        day,
        files: fullDayFiles.map((descriptor) => descriptor.fileName)
      });
    }

    const hourRanges = parsed
      .filter((descriptor) => descriptor.kind === "hour-range")
      .sort((left, right) => (left.hourStart ?? 0) - (right.hourStart ?? 0));

    for (let index = 1; index < hourRanges.length; index += 1) {
      const previous = hourRanges[index - 1];
      const current = hourRanges[index];
      if ((current.hourStart ?? 0) <= (previous.hourEnd ?? -1)) {
        serverLogger.warn("Overlapping hour-range transcript files detected", {
          day,
          previousFile: previous.fileName,
          currentFile: current.fileName,
          previousRange: `${previous.hourStart}-${previous.hourEnd}`,
          currentRange: `${current.hourStart}-${current.hourEnd}`
        });
      }
    }
  }
};

export const ingestTranscriptCsvDirectory = async (transcriptCsvDir: string, em: EntityManager): Promise<TranscriptIngestionSummary> => {
  const files = (await fs.readdir(transcriptCsvDir))
    .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
    .sort(compareTranscriptFiles);

  logOverlapWarnings(files);

  const existingUtteranceCount = await em.count(TranscriptUtterance, {});
  serverLogger.info("Resetting transcript table before CSV ingestion", {
    existingUtteranceCount
  });
  await em.nativeDelete(TranscriptUtterance, {});

  let inserted = 0;
  let skipped = 0;
  let parseErrors = 0;
  for (const fileName of files) {
    const filePath = path.join(transcriptCsvDir, fileName);
    const result = await ingestFile(filePath, em);
    inserted += result.inserted;
    skipped += result.skipped;
    parseErrors += result.parseErrors;
    serverLogger.info("Inserted records from transcript file", {
      fileName,
      insertedRecords: result.inserted,
      skippedRecords: result.skipped,
      parseErrors: result.parseErrors,
      totalInserted: inserted
    });
  }

  const utterancesInDatabase = await em.count(TranscriptUtterance, {});
  return {
    filesProcessed: files.length,
    inserted,
    skipped,
    parseErrors,
    utterancesInDatabase
  };
};
