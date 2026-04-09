import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, fetchDashboard, fetchHealth, fetchStatsDailyVolume, fetchStatsSummary, searchUtterances } from "./api";

const mockFetch = vi.fn<typeof fetch>();

vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

describe("api helpers", () => {
  it("loads dashboard payload", async () => {
    const payload = { generatedAt: "2026-04-05", missionSummary: "summary", recentChanges: "changes", days: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => payload
    } as Response);

    await expect(fetchDashboard()).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/dashboard");
  });

  it("sends chat request with body", async () => {
    const payload = {
      answer: "ok",
      evidence: [],
      strategy: { mode: "rag_chat", totalUtterances: 50, contextUtterances: 50, daysQueried: 5 }
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(chat("status")).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "status", mode: "rag_chat" })
    });
  });

  it("allows overriding chat mode", async () => {
    const payload = {
      answer: "ok",
      evidence: [],
      strategy: { mode: "llm_chat", totalUtterances: 50, contextUtterances: 50, daysQueried: 5 }
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(chat("status", "llm_chat")).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "status", mode: "llm_chat" })
    });
  });


  it("loads ranked utterance search payload", async () => {
    const payload = {
      query: "status",
      queryTokens: ["status"],
      totalUtterances: 25,
      resultCount: 1,
      utterances: [
        {
          timestamp: "2026-04-06T00:00:00Z",
          day: "2026-04-06",
          channel: "FLIGHT",
          text: "status update",
          filename: "day6.csv",
          source: "day6.csv",
          score: 0.9
        }
      ]
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(searchUtterances("status", 5)).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/search/utterances?q=status&limit=5");
  });

  it("loads health payload", async () => {
    const payload = {
      ok: true,
      llm: { connected: true, model: "test", baseUrl: "https://example.invalid", checkedAt: "now", error: null }
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(fetchHealth()).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/health");
  });

  it("loads database-backed mission stats summary", async () => {
    const payload = {
      generatedAt: "2026-04-05T12:00:00Z",
      days: { minDay: "2026-04-01", maxDay: "2026-04-05" },
      totals: { utterances: 12, words: 140, channels: 4 }
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(fetchStatsSummary()).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/stats/summary");
  });

  it("loads database-backed daily transcript volume", async () => {
    const payload = {
      generatedAt: "2026-04-09T12:00:00Z",
      days: [{ day: "2026-04-09", utterances: 120, words: 1300, channels: 8 }]
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(fetchStatsDailyVolume(5)).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/stats/daily-volume?days=5");
  });
});
