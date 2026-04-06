import { describe, expect, it } from "vitest";
import { tokenizeQuery, tokenizeUtterance } from "./tokenizer.js";

describe("tokenizer", () => {
  it("normalizes case, strips punctuation, and removes stop words", () => {
    const tokens = tokenizeQuery("What ECLSS leak issue did we see in the latest day?");

    expect(tokens).toContain("eclss");
    expect(tokens).toContain("leak");
    expect(tokens).toContain("issue");
    expect(tokens).not.toContain("what");
    expect(tokens).not.toContain("the");
  });

  it("returns unique utterance tokens", () => {
    const tokens = tokenizeUtterance("Leak leak LEAK in cabin pressure loop");
    expect(tokens).toEqual(["leak", "cabin", "pressure", "loop"]);
  });
});
