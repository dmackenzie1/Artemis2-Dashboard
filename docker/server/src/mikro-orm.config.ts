import { defineConfig } from "@mikro-orm/postgresql";
import { env } from "./env.config.js";
import { PromptDefinitionSchema } from "./entities/PromptDefinition.js";
import { PromptExecutionSchema } from "./entities/PromptExecution.js";
import { TranscriptUtteranceSchema } from "./entities/TranscriptUtterance.js";
import { DailySummarySchema } from "./entities/DailySummary.js";

export default defineConfig({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASS,
  dbName: env.DB_NAME,
  entities: [TranscriptUtteranceSchema, PromptDefinitionSchema, PromptExecutionSchema, DailySummarySchema],
  debug: false
});
