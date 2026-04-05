import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost"),
  DATA_DIR: z.string().default("/app/sample_data"),
  PROMPTS_DIR: z.string().default("/app/prompts"),
  CACHE_FILE: z.string().default("/app/data/cache.json"),
  LLM_API_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("internal-gemini")
});

export const env = EnvSchema.parse(process.env);
