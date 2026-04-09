import type { MikroORM } from "@mikro-orm/postgresql";

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
