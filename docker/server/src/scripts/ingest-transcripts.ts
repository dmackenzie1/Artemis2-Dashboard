import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MikroORM } from "@mikro-orm/postgresql";
import { parse } from "csv-parse";
import config from "../mikro-orm.config.js";
import { env } from "../env.config.js";
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

const BATCH_SIZE = 750;

const ingestFile = async (filePath: string, orm: MikroORM): Promise<number> => {
  const sourceFile = path.basename(filePath);
  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: false,
      relax_column_count: true
    })
  );

  let insertedCount = 0;
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
      continue;
    }

    batch.push(entity);

    if (batch.length >= BATCH_SIZE) {
      await orm.em.insertMany(TranscriptUtterance, batch);
      insertedCount += batch.length;
      serverLogger.info("Inserted transcript batch into database", {
        sourceFile,
        insertedRows: batch.length,
        insertedSoFar: insertedCount
      });
      batch = [];
    }
  }

  if (batch.length > 0) {
    await orm.em.insertMany(TranscriptUtterance, batch);
    insertedCount += batch.length;
    serverLogger.info("Inserted transcript batch into database", {
      sourceFile,
      insertedRows: batch.length,
      insertedSoFar: insertedCount
    });
  }

  return insertedCount;
};

const ingestDirectory = async (): Promise<void> => {
  const orm = await MikroORM.init(config);

  try {
    const generator = orm.getSchemaGenerator();
    await generator.createSchema();

    const files = (await fs.readdir(env.TRANSCRIPT_CSV_DIR))
      .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
      .sort();

    let totalInserted = 0;
    for (const fileName of files) {
      const filePath = path.join(env.TRANSCRIPT_CSV_DIR, fileName);
      const inserted = await ingestFile(filePath, orm);
      totalInserted += inserted;
      serverLogger.info("Inserted records from transcript file", {
        fileName,
        insertedRecords: inserted,
        totalInserted
      });
    }

    serverLogger.info("Transcript ingestion finished", { totalInsertedRecords: totalInserted });
  } finally {
    await orm.close(true);
  }
};

void ingestDirectory();
