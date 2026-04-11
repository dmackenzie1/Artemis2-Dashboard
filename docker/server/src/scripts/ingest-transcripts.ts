import { MikroORM } from "@mikro-orm/postgresql";
import config from "../mikro-orm.config.js";
import { env } from "../env.config.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { ingestTranscriptCsvDirectory } from "../services/transcriptIngestionService.js";

const ingestDirectory = async (): Promise<void> => {
  const orm = await MikroORM.init(config);

  try {
    const connection = orm.em.getConnection();
    try {
      const hasFilename = await connection.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'transcript_utterances' AND column_name = 'filename'");
      if (hasFilename.length > 0) {
        await connection.execute("ALTER TABLE transcript_utterances RENAME COLUMN filename TO audio_file_name");
      }
      
      const hasDay = await connection.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'transcript_utterances' AND column_name = 'day'");
      if (hasDay.length === 0) {
        await connection.execute("ALTER TABLE transcript_utterances ADD COLUMN day VARCHAR(10)");
        await connection.execute("UPDATE transcript_utterances SET day = TO_CHAR(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD')");
      }
    } catch (e) {
      serverLogger.warn("Failed to apply manual pre-migrations", { error: e });
    }

    await orm.getSchemaGenerator().updateSchema();
    const summary = await ingestTranscriptCsvDirectory(env.DATA_DIR, orm.em.fork());
    serverLogger.info("Transcript ingestion finished", summary);
  } finally {
    await orm.close(true);
  }
};

void ingestDirectory();
