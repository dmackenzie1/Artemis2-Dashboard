import express from "express";
import cors from "cors";
import { env } from "./env.config.js";
import { LlmClient } from "./services/llmClient.js";
import { AnalysisService } from "./services/analysisService.js";
import { createApiRouter } from "./routes/api.js";

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "4mb" }));

const analysisService = new AnalysisService({
  dataDir: env.DATA_DIR,
  promptsDir: env.PROMPTS_DIR,
  cacheFile: env.CACHE_FILE,
  llmClient: new LlmClient(env.LLM_API_URL, env.LLM_API_KEY, env.LLM_MODEL)
});

await analysisService.loadFromDisk();
app.use("/api", createApiRouter(analysisService));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  res.status(500).json({ message });
});

app.listen(env.PORT);
