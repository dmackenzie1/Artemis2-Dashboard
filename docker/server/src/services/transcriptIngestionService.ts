import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";
import { parse, type CsvError, type Info } from "csv-parse";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { IngestionSourceFile } from "../entities/IngestionSourceFile.js";
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
  sourceFile: string;
  inserted: number;
  skipped: number;
  parseErrors: number;
  checksum: string;
  day: string;
};

export type TranscriptFileLoadStartedEvent = {
  sourceFile: string;
  day: string;
  parsedSourceFile: ReturnType<typeof parseTranscriptFileName>;
};

export type TranscriptFileLoadCompletedEvent = {
  sourceFile: string;
  day: string;
  inserted: number;
  deletedRows: number;
  skipped: number;
  parseErrors: number;
  utterancesInDatabase: number;
};

type IngestTranscriptCsvDirectoryOptions = {
  onFileLoadStarted?: (event: TranscriptFileLoadStartedEvent) => void;
  onFileLoadCompleted?: (event: TranscriptFileLoadCompletedEvent) => void;
};

export type TranscriptIngestionSummary = {
  filesProcessed: number;
  filesSkippedUnchanged: number;
  inserted: number;
  deleted: number;
  skipped: number;
  parseErrors: number;
  utterancesInDatabase: number;
  changedDayKeys: string[];
};

const BATCH_SIZE = 750;

type TimestampValidationState = {
  mismatchedDayRows: number;
  outOfRangeHourRows: number;
};

const checksumFile = async (filePath: string): Promise<string> => {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
    stream.on("error", (error) => reject(error));
  });
  return hash.digest("hex");
};

const ingestFile = async (filePath: string, em: EntityManager, checksum: string): Promise<IngestFileResult> => {
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
      audioFileName: row.Filename ?? "",
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

  return {
    sourceFile,
    inserted,
    skipped,
    parseErrors,
    checksum,
    day: parsedSourceFile?.day ?? "unspecified-day"
  };
};

const logOverlapWarnings = (fileNames: string[]): void => {
  const groupedByDay = fileNames.reduce<Map<string, string[]>>((grouped, audioFileName) => {
    const parsed = parseTranscriptFileName(audioFileName);
    if (!parsed) {
      return grouped;
    }

    const existing = grouped.get(parsed.day) ?? [];
    existing.push(audioFileName);
    grouped.set(parsed.day, existing);
    return grouped;
  }, new Map<string, string[]>());

  for (const [day, dayFileNames] of groupedByDay.entries()) {
    const parsed = dayFileNames
      .map((audioFileName) => parseTranscriptFileName(audioFileName))
      .filter((descriptor): descriptor is NonNullable<typeof descriptor> => Boolean(descriptor));

    const fullDayFiles = parsed.filter((descriptor) => descriptor.kind === "full-day");
    if (fullDayFiles.length > 1) {
      serverLogger.warn("Duplicate full-day transcript files detected for a single day", {
        day,
        files: fullDayFiles.map((descriptor) => descriptor.audioFileName)
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
          previousFile: previous.audioFileName,
          currentFile: current.audioFileName,
          previousRange: `${previous.hourStart}-${previous.hourEnd}`,
          currentRange: `${current.hourStart}-${current.hourEnd}`
        });
      }
    }
  }
};

export const ingestTranscriptCsvDirectory = async (
  transcriptCsvDir: string,
  em: EntityManager,
  options: IngestTranscriptCsvDirectoryOptions = {}
): Promise<TranscriptIngestionSummary> => {
  const files = (await fs.readdir(transcriptCsvDir))
    .filter((audioFileName) => audioFileName.toLowerCase().endsWith(".csv"))
    .sort(compareTranscriptFiles);

  logOverlapWarnings(files);

  const manifestRows = await em.find(IngestionSourceFile, {});
  const manifestBySourceFile = new Map(manifestRows.map((row) => [row.sourceFile, row]));
  let filesSkippedUnchanged = 0;
  let inserted = 0;
  let deleted = 0;
  let skipped = 0;
  let parseErrors = 0;
  const changedDayKeys = new Set<string>();

  const removedFiles = manifestRows.filter((row) => !files.includes(row.sourceFile));
  for (const removed of removedFiles) {
    const removedRows = await em.nativeDelete(TranscriptUtterance, { sourceFile: removed.sourceFile });
    deleted += removedRows;
    changedDayKeys.add(removed.day);
    await em.nativeDelete(IngestionSourceFile, { sourceFile: removed.sourceFile });
    serverLogger.info("Removed transcript rows for deleted source file", {
      sourceFile: removed.sourceFile,
      deletedRows: removedRows,
      day: removed.day
    });
  }

  for (const audioFileName of files) {
    const filePath = path.join(transcriptCsvDir, audioFileName);
    const checksum = await checksumFile(filePath);
    const existingManifest = manifestBySourceFile.get(audioFileName);
    if (existingManifest?.checksum === checksum) {
      filesSkippedUnchanged += 1;
      continue;
    }

    const parsedSourceFile = parseTranscriptFileName(audioFileName);
    const day = parsedSourceFile?.day ?? "unspecified-day";
    options.onFileLoadStarted?.({
      sourceFile: audioFileName,
      day,
      parsedSourceFile
    });
    const deletedRows = await em.nativeDelete(TranscriptUtterance, { sourceFile: audioFileName });
    deleted += deletedRows;

    const result = await ingestFile(filePath, em, checksum);
    inserted += result.inserted;
    skipped += result.skipped;
    parseErrors += result.parseErrors;
    changedDayKeys.add(result.day);

    const nextManifest = existingManifest ?? em.create(IngestionSourceFile, {
      sourceFile: audioFileName,
      checksum: result.checksum,
      day,
      rowCount: result.inserted,
      updatedAt: new Date()
    });
    nextManifest.checksum = result.checksum;
    nextManifest.day = day;
    nextManifest.rowCount = result.inserted;
    nextManifest.updatedAt = new Date();
    em.persist(nextManifest);
    await em.flush();
    const utterancesInDatabase = await em.count(TranscriptUtterance, {});
    options.onFileLoadCompleted?.({
      sourceFile: result.sourceFile,
      day: result.day,
      inserted: result.inserted,
      deletedRows,
      skipped: result.skipped,
      parseErrors: result.parseErrors,
      utterancesInDatabase
    });

    serverLogger.info("Inserted records from transcript file", {
      audioFileName,
      deletedRows,
      insertedRecords: result.inserted,
      skippedRecords: result.skipped,
      parseErrors: result.parseErrors,
      totalInserted: inserted
    });
  }

  const utterancesInDatabase = await em.count(TranscriptUtterance, {});
  return {
    filesProcessed: files.length,
    filesSkippedUnchanged,
    inserted,
    deleted,
    skipped,
    parseErrors,
    utterancesInDatabase,
    changedDayKeys: [...changedDayKeys].sort((left, right) => left.localeCompare(right))
  };
};
