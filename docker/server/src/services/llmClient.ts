import type { Topic } from "../types.js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serverLogger } from "../utils/logging/serverLogger.js";

export type LlmResponseCache = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

type GenerateOptions = {
  systemPrompt: string;
  userPrompt: string;
  componentId?: string;
  requestId?: string;
  cacheEnabled?: boolean;
};

export type LlmConnectivityStatus = {
  connected: boolean;
  model: string | null;
  baseUrl: string | null;
  checkedAt: string;
  error: string | null;
};

export class LlmClient {
  private queue = Promise.resolve();
  private requestCounter = 0;
  private debugDirectoryInitialized = false;

  constructor(
    private readonly apiUrl?: string,
    private readonly apiKey?: string,
    private readonly model?: string,
    private readonly debugPromptsDir?: string,
    private readonly maxTokens = 12_000,
    private readonly responseCache?: LlmResponseCache,
    private readonly cacheTtlSeconds = 60 * 60
  ) {}

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const queuedTask = this.queue.then(task, task);
    this.queue = queuedTask.then(
      () => undefined,
      () => undefined
    );
    return queuedTask;
  }

  private createPreview(text: string, maxChars: number, maxLines: number): string {
    const allLines = text.split(/\r?\n/);
    const lines = allLines.slice(0, maxLines);
    const joined = lines.join("\n");
    if (joined.length <= maxChars && lines.length === allLines.length) {
      return joined;
    }

    return `${joined.slice(0, maxChars)}…`;
  }

  private extractText(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.extractText(item)).join("\n").trim();
    }

    if (value && typeof value === "object") {
      const asRecord = value as Record<string, unknown>;
      if (typeof asRecord.text === "string") {
        return asRecord.text;
      }

      if (typeof asRecord.content === "string") {
        return asRecord.content;
      }

      if ("content" in asRecord) {
        return this.extractText(asRecord.content);
      }
    }

    return "";
  }

  private firstNonEmpty(candidates: Array<unknown>): string {
    for (const candidate of candidates) {
      const extracted = this.extractText(candidate).trim();
      if (extracted.length > 0) {
        return extracted;
      }
    }

    return "";
  }

  private sanitizeSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private createCacheKey(options: GenerateOptions): string {
    return createHash("sha256")
      .update(JSON.stringify({
        model: this.model ?? null,
        apiUrl: this.apiUrl ?? null,
        maxTokens: this.maxTokens,
        systemPrompt: options.systemPrompt,
        userPrompt: options.userPrompt
      }))
      .digest("hex");
  }

  private async readCachedResponse(cacheKey: string, componentId: string, requestId: string): Promise<string | null> {
    if (!this.responseCache) {
      return null;
    }

    try {
      const cached = await this.responseCache.get(cacheKey);
      if (cached) {
        serverLogger.info("LLM response served from Redis cache", {
          requestId,
          componentId,
          cacheKey
        });
      }
      return cached;
    } catch (error) {
      serverLogger.warn("Redis cache read failed for LLM request", {
        requestId,
        componentId,
        cacheKey,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      return null;
    }
  }

  private async writeCachedResponse(cacheKey: string, value: string, componentId: string, requestId: string): Promise<void> {
    if (!this.responseCache) {
      return;
    }

    try {
      await this.responseCache.set(cacheKey, value, this.cacheTtlSeconds);
    } catch (error) {
      serverLogger.warn("Redis cache write failed for LLM request", {
        requestId,
        componentId,
        cacheKey,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  private async persistDebugPrompt(
    direction: "outgoing" | "incoming",
    requestId: string,
    componentId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.debugPromptsDir) {
      return;
    }

    try {
      await mkdir(this.debugPromptsDir, { recursive: true });

      const directionDirectoryName = direction === "outgoing" ? "query-set" : "query-receive";
      const directionDirectoryPath = path.join(this.debugPromptsDir, directionDirectoryName);
      await mkdir(directionDirectoryPath, { recursive: true });

      if (!this.debugDirectoryInitialized) {
        const todoFilePath = path.join(this.debugPromptsDir, "README-TODO-DELETE-ME.txt");
        await writeFile(
          todoFilePath,
          [
            "Temporary debug artifacts for LLM prompts/responses.",
            "TODO: Delete this directory and disable LLM_DEBUG_PROMPTS_DIR after debugging is complete."
          ].join("\n"),
          "utf8"
        );
        this.debugDirectoryInitialized = true;
      }

      const timestamp = new Date().toISOString().replaceAll(":", "-");
      const safeRequestId = this.sanitizeSegment(requestId);
      const safeComponentId = this.sanitizeSegment(componentId);
      const fileName = `${timestamp}_${direction}_${safeComponentId}_${safeRequestId}.json`;
      const filePath = path.join(directionDirectoryPath, fileName);

      await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    } catch (error) {
      serverLogger.warn("Unable to write LLM debug prompt artifact", {
        requestId,
        componentId,
        debugPromptsDir: this.debugPromptsDir,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  async generateText(options: GenerateOptions): Promise<string> {
    const requestId = options.requestId ?? `llm-${Date.now()}-${++this.requestCounter}`;
    const componentId = options.componentId ?? "unknown-component";
    const cacheEnabled = options.cacheEnabled ?? true;
    const cacheKey = cacheEnabled ? this.createCacheKey(options) : null;

    if (cacheEnabled && cacheKey) {
      const cachedResponse = await this.readCachedResponse(cacheKey, componentId, requestId);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    return this.enqueue(async () => {
      const requestUserPreview = this.createPreview(options.userPrompt, 350, 2);
      const requestSystemPreview = this.createPreview(options.systemPrompt, 350, 2);
      serverLogger.info("LLM request queued", {
        requestId,
        componentId,
        requestSystemPreview,
        requestUserPreview,
        requestSystemLength: options.systemPrompt.length,
        requestUserLength: options.userPrompt.length
      });
      await this.persistDebugPrompt("outgoing", requestId, componentId, {
        requestId,
        componentId,
        sentAt: new Date().toISOString(),
        model: this.model ?? null,
        apiUrl: this.apiUrl ?? null,
        systemPrompt: options.systemPrompt,
        userPrompt: options.userPrompt
      });

      if (!this.apiUrl) {
        const fallback = `Prototype fallback response:\n${options.userPrompt.slice(0, 500)}...`;
        serverLogger.info("LLM response received (fallback)", {
          requestId,
          componentId,
          responsePreview: this.createPreview(fallback, 450, 3),
          responseLength: fallback.length
        });
        await this.persistDebugPrompt("incoming", requestId, componentId, {
          requestId,
          componentId,
          receivedAt: new Date().toISOString(),
          response: fallback,
          responseLength: fallback.length,
          mode: "fallback"
        });
        if (cacheEnabled && cacheKey) {
          await this.writeCachedResponse(cacheKey, fallback, componentId, requestId);
        }
        return fallback;
      }

      const isOpenAiCompatible = this.apiUrl.includes("/v1/chat/completions");

      let response: Response;
      try {
        response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}`, "x-api-key": this.apiKey } : {}),
            ...(isOpenAiCompatible ? {} : { "anthropic-version": "2023-06-01" })
          },
          body: JSON.stringify(
            isOpenAiCompatible
              ? {
                  model: this.model,
                  max_tokens: this.maxTokens,
                  messages: [
                    {
                      role: "system",
                      content: options.systemPrompt
                    },
                    {
                      role: "user",
                      content: options.userPrompt
                    }
                  ]
                }
              : {
                  model: this.model,
                  system: options.systemPrompt,
                  max_tokens: this.maxTokens,
                  messages: [
                    {
                      role: "user",
                      content: options.userPrompt
                    }
                  ]
                }
          )
        });
      } catch (error) {
        const fallback = `Prototype fallback response:\n${options.userPrompt.slice(0, 500)}...`;
        serverLogger.warn("LLM transport error, using fallback response", {
          requestId,
          componentId,
          error: error instanceof Error ? error.message : "Unknown error"
        });
        await this.persistDebugPrompt("incoming", requestId, componentId, {
          requestId,
          componentId,
          receivedAt: new Date().toISOString(),
          response: fallback,
          responseLength: fallback.length,
          mode: "transport-fallback",
          error: error instanceof Error ? error.message : "Unknown error"
        });
        if (cacheEnabled && cacheKey) {
          await this.writeCachedResponse(cacheKey, fallback, componentId, requestId);
        }
        return fallback;
      }

      if (!response.ok) {
        const text = await response.text();
        serverLogger.error("LLM response failed", {
          status: response.status,
          errorPreview: this.createPreview(text, 450, 3)
        });
        await this.persistDebugPrompt("incoming", requestId, componentId, {
          requestId,
          componentId,
          receivedAt: new Date().toISOString(),
          status: response.status,
          error: text
        });
        throw new Error(`LLM request failed: ${response.status} ${text}`);
      }

      const payload = (await response.json()) as {
        text?: string;
        content?: string;
        completion?: string;
        content_blocks?: Array<{ text?: string }>;
        messages?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
        error?: { message?: string };
      };

      const output = this.firstNonEmpty([
        payload.text,
        payload.content,
        payload.completion,
        payload.content_blocks,
        payload.messages?.[0]?.content,
        payload.choices?.[0]?.message?.content
      ]);

      serverLogger.info("LLM response received", {
        requestId,
        componentId,
        responsePreview: this.createPreview(output, 450, 3),
        responseLength: output.length
      });
      await this.persistDebugPrompt("incoming", requestId, componentId, {
        requestId,
        componentId,
        receivedAt: new Date().toISOString(),
        response: output,
        responseLength: output.length,
        rawPayload: payload
      });
      if (cacheEnabled && cacheKey) {
        await this.writeCachedResponse(cacheKey, output, componentId, requestId);
      }

      return output;
    });
  }

  async checkConnectivity(): Promise<LlmConnectivityStatus> {
    const checkedAt = new Date().toISOString();

    if (!this.apiUrl) {
      return {
        connected: false,
        model: this.model ?? null,
        baseUrl: null,
        checkedAt,
        error: "ANTHROPIC_BASE_URL is not configured; running in fallback mode."
      };
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: "OPTIONS",
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}`, "x-api-key": this.apiKey } : {})
        }
      });
      if (!response.ok) {
        throw new Error(`Connectivity probe failed: ${response.status} ${response.statusText}`);
      }

      return {
        connected: true,
        model: this.model ?? null,
        baseUrl: this.apiUrl,
        checkedAt,
        error: null
      };
    } catch (error) {
      return {
        connected: false,
        model: this.model ?? null,
        baseUrl: this.apiUrl,
        checkedAt,
        error: error instanceof Error ? error.message : "Unknown connectivity error"
      };
    }
  }

  parseTopics(raw: string): Topic[] {
    try {
      const parsed = JSON.parse(raw) as Topic[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // no-op fallback
    }

    return [
      {
        title: "Mission Systems Coordination",
        description: raw.slice(0, 300),
        channels: ["ORION MER MANAGER"],
        mentionTimestamps: []
      }
    ];
  }
}
