import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseLlmJsonWithSchema } from "./llmJson.js";

const objectSchema = z.object({ summary: z.string().min(1) });

describe("parseLlmJsonWithSchema", () => {
  it("accepts JSON wrapped in markdown fences", () => {
    const result = parseLlmJsonWithSchema("```json\n{\"summary\":\"ok\"}\n```", objectSchema, "object");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toBe("ok");
    }
  });

  it("rejects malformed JSON", () => {
    const result = parseLlmJsonWithSchema("{\"summary\":", objectSchema, "object");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("json-parse-failed");
    }
  });

  it("rejects HTML where JSON object is expected", () => {
    const result = parseLlmJsonWithSchema("<html><body>bad</body></html>", objectSchema, "object");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detectedFormat).toBe("html");
    }
  });

  it("rejects arrays when an object contract is expected", () => {
    const result = parseLlmJsonWithSchema("[]", objectSchema, "object");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("root-type-mismatch");
    }
  });
});
