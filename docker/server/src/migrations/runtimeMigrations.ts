import type { MikroORM } from "@mikro-orm/postgresql";

export const ensurePromptExecutionSubmittedTextColumn = async (orm: MikroORM): Promise<void> => {
  await orm.em.getConnection().execute(`
    alter table "prompt_executions"
    add column if not exists "submitted_text" text not null default '';
  `);
};

export const ensureTranscriptSearchIndexes = async (orm: MikroORM): Promise<void> => {
  await orm.em.getConnection().execute(`
    create index if not exists "idx_transcript_utterances_tokens_gin"
      on "transcript_utterances"
      using gin ("tokens");
  `);

  await orm.em.getConnection().execute(`
    create index if not exists "idx_transcript_utterances_channel_lower"
      on "transcript_utterances" (lower("channel"));
  `);
};

export const runRuntimeMigrations = async (orm: MikroORM): Promise<void> => {
  await ensurePromptExecutionSubmittedTextColumn(orm);
  await ensureTranscriptSearchIndexes(orm);
};
