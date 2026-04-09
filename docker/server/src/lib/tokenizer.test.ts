import { describe, expect, it } from "vitest";
import { countTextTokens, tokenizeQuery } from "./tokenizer.js";

describe("tokenizeQuery", () => {
  it("applies ASR correction aliases", () => {
    const tokens = tokenizeQuery("Hanswell called Scuba and Babelaw about Ecom");

    expect(tokens).toContain("huntsville");
    expect(tokens).toContain("tsukuba");
    expect(tokens).toContain("vavilov");
    expect(tokens).toContain("eecom");
  });

  it("normalizes tactical IDs with hyphenated numeric forms", () => {
    const tokens = tokenizeQuery("Saw 3 deletion complete and OTC3 prep is go");

    expect(tokens).toContain("sw-3");
    expect(tokens).toContain("otc-3");
  });

  it("counts text tokens for chunking budgets", () => {
    const tokenCount = countTextTokens("Flight, copy. OTC3 status is go!");

    expect(tokenCount).toBeGreaterThan(4);
  });
});
