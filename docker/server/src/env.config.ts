import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost"),
  DATA_DIR: z.string().default("/app/sample_data"),
  PROMPTS_DIR: z.string().default("/app/prompts"),
  CACHE_FILE: z.string().default("/app/data/cache.json"),
  ANTHROPIC_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("opusplan"),
  TRANSCRIPTS_DB_ENABLED: z.coerce.boolean().default(false),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default("artemis"),
  DB_PASS: z.string().default("artemis"),
  DB_NAME: z.string().default("artemis_transcripts"),
  TRANSCRIPT_CSV_DIR: z.string().default("/app/TB-Artemis-Summaries")
});

export const env = EnvSchema.parse(process.env);
