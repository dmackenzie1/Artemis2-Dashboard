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
  PIPELINE_AUTO_RUN: z.coerce.boolean().default(true),
  REDIS_URL: z.string().default("redis://redis:6379"),
  REDIS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60),
  REDIS_CACHE_STALE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60 * 60),
  REDIS_CACHE_ENABLED: z.coerce.boolean().default(true),
  NOTABLE_MOMENTS_BASELINE_PER_DAY: z.coerce.number().int().min(1).max(24).default(10),
  NOTABLE_MOMENTS_MIN_PER_DAY: z.coerce.number().int().min(1).max(24).default(4),
  NOTABLE_MOMENTS_HIGH_SIGNAL_PER_DAY: z.coerce.number().int().min(1).max(24).default(15),
  NOTABLE_MOMENTS_MAX_PER_DAY: z.coerce.number().int().min(1).max(24).default(24)
});

export const env = EnvSchema.parse(process.env);
