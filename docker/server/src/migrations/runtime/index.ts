import type { MikroORM } from "@mikro-orm/postgresql";
import { ensurePromptExecutionSubmittedTextColumn } from "./ensurePromptExecutionSubmittedTextColumn.js";
import { ensureTranscriptSearchIndexes } from "./ensureTranscriptSearchIndexes.js";

export const runRuntimeMigrations = async (orm: MikroORM): Promise<void> => {
  await ensurePromptExecutionSubmittedTextColumn(orm);
  await ensureTranscriptSearchIndexes(orm);
};

export { ensurePromptExecutionSubmittedTextColumn, ensureTranscriptSearchIndexes };
