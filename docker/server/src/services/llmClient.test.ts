import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  it("parses topic arrays wrapped in markdown fences", () => {
    const client = new LlmClient();

    const topics = client.parseTopics("```json\n[{\"title\":\"Power\",\"description\":\"Power status\",\"channels\":[\"FLIGHT\"],\"mentionTimestamps\":[\"10:00\"]}]\n```");

    expect(topics).toHaveLength(1);
    expect(topics[0]?.title).toBe("Power");
  });

  it("rejects html topic payloads and returns fallback", () => {
    const client = new LlmClient();

    const topics = client.parseTopics("<html><body>bad</body></html>");

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

  it("extracts text when provider returns array content blocks without a type field", async () => {
    const originalFetch = global.fetch;

    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [{ text: "pane-ready" }]
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const client = new LlmClient("https://itar-llm-api-access-dev.caio.mcp.nasa.gov/v1/chat/completions", "test-key", "gemini-test");
      const output = await client.generateText({
        systemPrompt: "Respond with pane-ready.",
        userPrompt: "test"
      });

      expect(output).toBe("pane-ready");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("writes outgoing and incoming debug artifacts when debug directory is configured", async () => {
    const originalFetch = global.fetch;
    const debugDir = await mkdtemp(path.join(os.tmpdir(), "llm-debug-prompts-"));

    try {
      global.fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "debuggable response"
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const client = new LlmClient(
        "https://itar-llm-api-access-dev.caio.mcp.nasa.gov/v1/chat/completions",
        "test-key",
        "gemini-test",
        debugDir
      );

      await client.generateText({
        requestId: "request:1",
        componentId: "mission/chat",
        systemPrompt: "Debug system prompt",
        userPrompt: "Debug user prompt"
      });

      const files = await readdir(debugDir);
      const querySetDir = path.join(debugDir, "query-set");
      const queryReceiveDir = path.join(debugDir, "query-receive");
      const querySetFiles = await readdir(querySetDir);
      const queryReceiveFiles = await readdir(queryReceiveDir);
      const debugPayloadFiles = [...querySetFiles, ...queryReceiveFiles];
      expect(files).toContain("README-DEBUG-ARTIFACTS.txt");
      expect(files).toContain("query-set");
      expect(files).toContain("query-receive");
      expect(debugPayloadFiles.length).toBe(2);
      expect(querySetFiles.some((audioFileName) => audioFileName.includes("outgoing_mission_chat_request_1"))).toBe(true);
      expect(queryReceiveFiles.some((audioFileName) => audioFileName.includes("incoming_mission_chat_request_1"))).toBe(true);

      const outgoingPath = path.join(
        querySetDir,
        querySetFiles.find((audioFileName) => audioFileName.includes("outgoing")) ?? ""
      );
      const outgoingPayload = JSON.parse(await readFile(outgoingPath, "utf8")) as { systemPrompt: string; userPrompt: string };
      expect(outgoingPayload.systemPrompt).toBe("Debug system prompt");
      expect(outgoingPayload.userPrompt).toBe("Debug user prompt");
    } finally {
      global.fetch = originalFetch;
      await rm(debugDir, { recursive: true, force: true });
    }
  });

  it("returns a fallback response when upstream transport fails", async () => {
    const originalFetch = global.fetch;

    try {
      global.fetch = async (): Promise<Response> => {
        throw new TypeError("fetch failed");
      };

      const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test");
      const output = await client.generateText({
        systemPrompt: "System prompt",
        userPrompt: "Please summarize this context."
      });

      expect(output).toContain("Prototype fallback response:");
      expect(output).toContain("Please summarize this context.");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("serves repeated non-chat requests from cache when configured", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "cached-output"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const cachedValues = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => cachedValues.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        cachedValues.set(key, value);
      })
    };

    try {
      global.fetch = mockFetch as unknown as typeof fetch;
      const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test", undefined, 12000, cache, 3600);

      const first = await client.generateText({
        systemPrompt: "Summarize in one line.",
        userPrompt: "same request"
      });
      const second = await client.generateText({
        systemPrompt: "Summarize in one line.",
        userPrompt: "same request"
      });

      expect(first).toBe("cached-output");
      expect(second).toBe("cached-output");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("bypasses cache when cacheEnabled is false", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "chat-output"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const cache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined)
    };

    try {
      global.fetch = mockFetch as unknown as typeof fetch;
      const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test", undefined, 12000, cache, 3600);

      await client.generateText({
        systemPrompt: "System",
        userPrompt: "chat request",
        cacheEnabled: false
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects oversized user prompts before network dispatch", async () => {
    const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test", undefined, 12000, undefined, 3600, 3600, 50);

    await expect(
      client.generateText({
        systemPrompt: "System",
        userPrompt: "x".repeat(120)
      })
    ).rejects.toThrow("LLM prompt too large");
  });

});

describe("LlmClient.checkConnectivity", () => {
  it("uses a lightweight POST probe aligned with normal model transport wiring", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "OK"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    try {
      global.fetch = mockFetch;
      const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test");

      const connectivity = await client.checkConnectivity();

      expect(connectivity.connected).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("https://example.test/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
          "x-api-key": "test-key"
        },
        body: JSON.stringify({
          model: "model-test",
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
        })
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns stale cached output immediately and refreshes in background", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "refreshed-output"
              }
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const cachedValues = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => cachedValues.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        cachedValues.set(key, value);
      })
    };

    try {
      global.fetch = mockFetch as unknown as typeof fetch;
      const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test", undefined, 12000, cache, 3600, 3600);

      const staleEnvelope = JSON.stringify({
        response: "stale-output",
        freshUntilEpochMs: Date.now() - 5_000,
        staleUntilEpochMs: Date.now() + 60_000
      });
      const cacheKey = (client as unknown as { createCacheKey: (options: { systemPrompt: string; userPrompt: string }) => string }).createCacheKey({
        systemPrompt: "System",
        userPrompt: "Prompt"
      });
      cachedValues.set(cacheKey, staleEnvelope);

      const output = await client.generateText({
        systemPrompt: "System",
        userPrompt: "Prompt"
      });
      expect(output).toBe("stale-output");

      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const refreshedEnvelopeRaw = cachedValues.get(cacheKey);
      expect(refreshedEnvelopeRaw).toBeTruthy();
      expect(refreshedEnvelopeRaw).toContain("refreshed-output");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
