import { defineConfig } from "@mikro-orm/postgresql";
import { env } from "./env.config.js";
import { TranscriptUtteranceSchema } from "./entities/TranscriptUtterance.js";

export default defineConfig({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASS,
  dbName: env.DB_NAME,
  entities: [TranscriptUtteranceSchema],
  debug: false
});
