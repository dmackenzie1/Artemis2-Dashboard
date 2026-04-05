import { MikroORM } from "@mikro-orm/postgresql";
import config from "../mikro-orm.config.js";
import { env } from "../env.config.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { ingestTranscriptCsvDirectory } from "../services/transcriptIngestionService.js";

const ingestDirectory = async (): Promise<void> => {
  const orm = await MikroORM.init(config);

  try {
    await orm.getSchemaGenerator().updateSchema();
    const summary = await ingestTranscriptCsvDirectory(env.DATA_DIR, orm.em.fork());
    serverLogger.info("Transcript ingestion finished", summary);
  } finally {
    await orm.close(true);
  }
};

void ingestDirectory();
