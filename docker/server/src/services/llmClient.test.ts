import { describe, expect, it } from "vitest";
import { LlmClient } from "./llmClient.js";

describe("LlmClient.parseTopics", () => {
  it("parses valid topic arrays", () => {
    const client = new LlmClient();
    const raw = JSON.stringify([
      {
        title: "Power",
        description: "Power systems status",
        channels: ["ORION MER MANAGER"],
        mentionTimestamps: ["10:00"]
      }
    ]);

    const topics = client.parseTopics(raw);

    expect(topics).toHaveLength(1);
    expect(topics[0]?.title).toBe("Power");
  });

  it("returns fallback topic when model output is not parseable json", () => {
    const client = new LlmClient();

    const topics = client.parseTopics("not-json");

    expect(topics).toHaveLength(1);
    expect(topics[0]?.title).toBe("Mission Systems Coordination");
  });
});

describe("LlmClient.generateText", () => {
  it("extracts text from OpenAI-compatible choices payloads", async () => {
    const originalFetch = global.fetch;

    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "ok"
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const client = new LlmClient("https://itar-llm-api-access-dev.caio.mcp.nasa.gov/v1/chat/completions", "test-key", "gemini-test");
      const output = await client.generateText({
        systemPrompt: "You are a connectivity check.",
        userPrompt: "Reply with exactly ok."
      });

      expect(output).toBe("ok");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
