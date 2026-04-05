import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost"),
  DATA_DIR: z.string().default("/app/source_files"),
  PROMPTS_DIR: z.string().default("/app/prompts"),
  CACHE_FILE: z.string().default("/app/data/cache.json"),
  ANTHROPIC_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("opusplan"),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(12000),
  TRANSCRIPTS_DB_ENABLED: z.coerce.boolean().default(true),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default("artemis"),
  DB_PASS: z.string().default("artemis"),
  DB_NAME: z.string().default("artemis_transcripts"),
  SOURCE_FILES_DIR: z.string().default("/app/source_files"),
  PROMPT_SUBMISSIONS_DIR: z.string().default("/app/data/prompt-submissions"),
  LLM_DEBUG_PROMPTS_DIR: z.string().default("/tmp/llm-prompts"),
  PIPELINE_INTERVAL_HOURS: z.coerce.number().positive().default(6),
  PIPELINE_AUTO_RUN: z.coerce.boolean().default(true)
});

export const env = EnvSchema.parse(process.env);
