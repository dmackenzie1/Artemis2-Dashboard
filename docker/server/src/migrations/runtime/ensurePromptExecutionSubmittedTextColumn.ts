import type { MikroORM } from "@mikro-orm/postgresql";

export const ensurePromptExecutionSubmittedTextColumn = async (orm: MikroORM): Promise<void> => {
  await orm.em.getConnection().execute(`
    alter table if exists "prompt_executions"
      add column if not exists "submitted_text" text not null default '';
  `);
};
