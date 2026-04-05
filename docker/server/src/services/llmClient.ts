import type { Topic } from "../types.js";

type GenerateOptions = {
  systemPrompt: string;
  userPrompt: string;
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

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey ? `Bearer ${this.apiKey}` : ""
      },
      body: JSON.stringify({
        model: this.model,
        system: options.systemPrompt,
        prompt: options.userPrompt
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${text}`);
    }

    const payload = (await response.json()) as { text?: string; content?: string };
    return payload.text ?? payload.content ?? "";
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
