import type { Topic } from "../types.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

type GenerateOptions = {
  systemPrompt: string;
  userPrompt: string;
  componentId?: string;
  requestId?: string;
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

  constructor(
    private readonly apiUrl?: string,
    private readonly apiKey?: string,
    private readonly model?: string
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

  async generateText(options: GenerateOptions): Promise<string> {
    const requestId = options.requestId ?? `llm-${Date.now()}-${++this.requestCounter}`;
    const componentId = options.componentId ?? "unknown-component";

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

      if (!this.apiUrl) {
        const fallback = `Prototype fallback response:\n${options.userPrompt.slice(0, 500)}...`;
        serverLogger.info("LLM response received (fallback)", {
          requestId,
          componentId,
          responsePreview: this.createPreview(fallback, 450, 3),
          responseLength: fallback.length
        });
        return fallback;
      }

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
                max_tokens: 300,
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
                max_tokens: 300,
                messages: [
                  {
                    role: "user",
                    content: options.userPrompt
                  }
                ]
              }
        )
      });

      if (!response.ok) {
        const text = await response.text();
        serverLogger.error("LLM response failed", {
          status: response.status,
          errorPreview: this.createPreview(text, 450, 3)
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
      await this.generateText({
        systemPrompt: "You are a connectivity check.",
        userPrompt: 'Reply with exactly "ok".'
      });

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
