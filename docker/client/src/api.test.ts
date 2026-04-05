import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, fetchDashboard, fetchHealth, triggerIngest } from "./api";

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

  it("throws if ingest endpoint fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

    await expect(triggerIngest()).rejects.toThrow("Unable to ingest data");
    expect(mockFetch).toHaveBeenCalledWith("/api/ingest", { method: "POST" });
  });

  it("sends chat request with body", async () => {
    const payload = {
      answer: "ok",
      evidence: [],
      strategy: { mode: "rag", totalUtterances: 50, contextUtterances: 20, wasTruncated: false }
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => payload } as Response);

    await expect(chat("status")).resolves.toEqual(payload);
    expect(mockFetch).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "status", mode: "rag" })
    });
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
});
