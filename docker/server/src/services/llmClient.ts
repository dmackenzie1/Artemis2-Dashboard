import type { Topic } from "../types.js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { parseLlmJsonWithSchema } from "../lib/llmJson.js";
import { z } from "zod";

export type LlmResponseCache = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

type CachedLlmEnvelope = {
  response: string;
  freshUntilEpochMs: number;
  staleUntilEpochMs: number;
};

type CacheLookupResult = {
  response: string;
  cacheState: "fresh" | "stale";
};

const defaultMaxUserPromptCharacters = 800_000;

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
  private readonly staleRefreshInFlight = new Set<string>();

  constructor(
    private readonly apiUrl?: string,
    private readonly apiKey?: string,
    private readonly model?: string,
    private readonly debugPromptsDir?: string,
    private readonly maxTokens = 12_000,
    private readonly responseCache?: LlmResponseCache,
    private readonly cacheTtlSeconds = 60 * 60,
    private readonly staleWhileRevalidateSeconds = 60 * 60,
    private readonly maxUserPromptCharacters = defaultMaxUserPromptCharacters
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

  private parseCacheEnvelope(rawCached: string): CachedLlmEnvelope | null {
    try {
      const parsed = JSON.parse(rawCached) as Partial<CachedLlmEnvelope>;
      if (
        typeof parsed?.response === "string" &&
        typeof parsed.freshUntilEpochMs === "number" &&
        typeof parsed.staleUntilEpochMs === "number"
      ) {
        return parsed as CachedLlmEnvelope;
      }
    } catch {
      return null;
    }

    return null;
  }

  private async readCachedResponse(cacheKey: string, componentId: string, requestId: string): Promise<CacheLookupResult | null> {
    if (!this.responseCache) {
      return null;
    }

    try {
      const cached = await this.responseCache.get(cacheKey);
      if (!cached) {
        return null;
      }

      const envelope = this.parseCacheEnvelope(cached);
      if (!envelope) {
        serverLogger.info("LLM response served from Redis cache (legacy format)", {
          requestId,
          componentId,
          cacheKey
        });
        return { response: cached, cacheState: "fresh" };
      }

      const now = Date.now();
      if (now >= envelope.staleUntilEpochMs) {
        return null;
      }

      const cacheState = now >= envelope.freshUntilEpochMs ? "stale" : "fresh";
      serverLogger.info("LLM response served from Redis cache", {
        requestId,
        componentId,
        cacheKey,
        cacheState
      });

      return { response: envelope.response, cacheState };
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
      const now = Date.now();
      const payload: CachedLlmEnvelope = {
        response: value,
        freshUntilEpochMs: now + this.cacheTtlSeconds * 1000,
        staleUntilEpochMs: now + (this.cacheTtlSeconds + this.staleWhileRevalidateSeconds) * 1000
      };
      await this.responseCache.set(cacheKey, JSON.stringify(payload), this.cacheTtlSeconds + this.staleWhileRevalidateSeconds);
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
        const todoFilePath = path.join(this.debugPromptsDir, "README-DEBUG-ARTIFACTS.txt");
        await writeFile(
          todoFilePath,
          [
            "Temporary debug artifacts for LLM prompts/responses.",
            "Disable LLM_DEBUG_PROMPTS_DIR when debug artifact capture is no longer needed."
          ].join("\n"),
          "utf8"
        );
        this.debugDirectoryInitialized = true;
      }

      const timestamp = new Date().toISOString().replaceAll(":", "-");
      const safeRequestId = this.sanitizeSegment(requestId);
      const safeComponentId = this.sanitizeSegment(componentId);
      const audioFileName = `${timestamp}_${direction}_${safeComponentId}_${safeRequestId}.json`;
      const filePath = path.join(directionDirectoryPath, audioFileName);

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
        if (cachedResponse.cacheState === "stale") {
          this.revalidateStaleCacheEntry(cacheKey, options);
        }
        return cachedResponse.response;
      }
    }

    return this.enqueue(() => this.performGenerateText(options, requestId, componentId, cacheKey, cacheEnabled));
  }

  private revalidateStaleCacheEntry(cacheKey: string, options: GenerateOptions): void {
    if (this.staleRefreshInFlight.has(cacheKey)) {
      return;
    }

    this.staleRefreshInFlight.add(cacheKey);
    this.enqueue(async () => {
      const refreshRequestId = `llm-stale-refresh-${Date.now()}-${++this.requestCounter}`;
      const componentId = options.componentId ?? "unknown-component";
      try {
        await this.performGenerateText(options, refreshRequestId, `${componentId}/stale-refresh`, cacheKey, true);
      } catch (error) {
        serverLogger.warn("Background LLM cache refresh failed", {
          componentId,
          cacheKey,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      } finally {
        this.staleRefreshInFlight.delete(cacheKey);
      }
    }).catch(() => {
      this.staleRefreshInFlight.delete(cacheKey);
    });
  }

  private async performGenerateText(
    options: GenerateOptions,
    requestId: string,
    componentId: string,
    cacheKey: string | null,
    cacheEnabled: boolean
  ): Promise<string> {
      if (options.userPrompt.length > this.maxUserPromptCharacters) {
        serverLogger.error("LLM request rejected: user prompt exceeds max length", {
          requestId,
          componentId,
          requestUserLength: options.userPrompt.length,
          maxUserPromptCharacters: this.maxUserPromptCharacters
        });
        throw new Error(
          `LLM prompt too large for ${componentId}. max=${this.maxUserPromptCharacters} actual=${options.userPrompt.length}`
        );
      }

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
      const isOpenAiCompatible = this.apiUrl.includes("/v1/chat/completions");
      const response = await fetch(this.apiUrl, {
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
                max_tokens: 8,
                messages: [
                  {
                    role: "system",
                    content: "Connectivity check. Reply with OK."
                  },
                  {
                    role: "user",
                    content: "OK"
                  }
                ]
              }
            : {
                model: this.model,
                system: "Connectivity check. Reply with OK.",
                max_tokens: 8,
                messages: [
                  {
                    role: "user",
                    content: "OK"
                  }
                ]
              }
        )
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Connectivity probe failed: ${response.status} ${response.statusText} ${errorBody}`.trim());
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
    const topicSchema = z.array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        channels: z.array(z.string()).default([]),
        mentionTimestamps: z.array(z.string()).default([])
      })
    );

    const parsed = parseLlmJsonWithSchema(raw, topicSchema, "array");
    if (parsed.ok) {
      return parsed.data;
    }

    serverLogger.warn("Top topics response violated JSON contract; using fallback topic", {
      componentId: "analysis/top_topics",
      expectedSchema: "Topic[]",
      expectedRoot: "array",
      actualFormat: parsed.detectedFormat,
      reason: parsed.reason
    });

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
