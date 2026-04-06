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
      expect(files).toContain("README-TODO-DELETE-ME.txt");
      expect(files).toContain("query-set");
      expect(files).toContain("query-receive");
      expect(debugPayloadFiles.length).toBe(2);
      expect(querySetFiles.some((fileName) => fileName.includes("outgoing_mission_chat_request_1"))).toBe(true);
      expect(queryReceiveFiles.some((fileName) => fileName.includes("incoming_mission_chat_request_1"))).toBe(true);

      const outgoingPath = path.join(
        querySetDir,
        querySetFiles.find((fileName) => fileName.includes("outgoing")) ?? ""
      );
      const outgoingPayload = JSON.parse(await readFile(outgoingPath, "utf8")) as { systemPrompt: string; userPrompt: string };
      expect(outgoingPayload.systemPrompt).toBe("Debug system prompt");
      expect(outgoingPayload.userPrompt).toBe("Debug user prompt");
    } finally {
      global.fetch = originalFetch;
      await rm(debugDir, { recursive: true, force: true });
    }
  });
});

describe("LlmClient.checkConnectivity", () => {
  it("uses a transport-level OPTIONS probe instead of generating model output", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn(async () => new Response(null, { status: 204 }));

    try {
      global.fetch = mockFetch;
      const client = new LlmClient("https://example.test/v1/chat/completions", "test-key", "model-test");

      const connectivity = await client.checkConnectivity();

      expect(connectivity.connected).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith("https://example.test/v1/chat/completions", {
        method: "OPTIONS",
        headers: {
          Authorization: "Bearer test-key",
          "x-api-key": "test-key"
        }
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
