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
