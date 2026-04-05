import type { Topic } from "../types.js";

type GenerateOptions = {
  systemPrompt: string;
  userPrompt: string;
};

export type LlmConnectivityStatus = {
  connected: boolean;
  model: string | null;
  baseUrl: string | null;
  checkedAt: string;
  error: string | null;
};

export class LlmClient {
  constructor(
    private readonly apiUrl?: string,
    private readonly apiKey?: string,
    private readonly model?: string
  ) {}

  async generateText(options: GenerateOptions): Promise<string> {
    if (!this.apiUrl) {
      return `Prototype fallback response:\n${options.userPrompt.slice(0, 500)}...`;
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

    const choiceContent = payload.choices?.[0]?.message?.content;
    const choiceText = Array.isArray(choiceContent)
      ? choiceContent.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n")
      : choiceContent;

    const messageContent = payload.messages?.[0]?.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    const contentBlocks = payload.content_blocks?.map((item) => item.text ?? "").join("\n");
    return payload.text ?? payload.content ?? payload.completion ?? contentBlocks ?? messageContent ?? choiceText ?? "";
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
