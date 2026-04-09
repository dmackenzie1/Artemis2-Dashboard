import type { EntityManager } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import { loadTranscriptCandidates } from "./transcriptCandidateService.js";

describe("loadTranscriptCandidates", () => {
  it("returns empty candidates when the query has no searchable tokens", async () => {
    const execute = vi.fn();
    const em = {
      getConnection: () => ({ execute })
    } as unknown as EntityManager;

    const result = await loadTranscriptCandidates(em, "   ");

    expect(result).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses explicit array bindings in SQL and maps database rows", async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        id: 42,
        timestamp: "2026-04-09T18:46:40Z",
        channel: "FD",
        durationSec: 8,
        language: "en",
        translated: false,
        text: "Sample transcript line",
        filename: "transcript.csv",
        sourceFile: "source_files/transcript.csv",
        tokens: ["sample", "transcript", "line"]
      }
    ]);

    const em = {
      getConnection: () => ({ execute })
    } as unknown as EntityManager;

    const result = await loadTranscriptCandidates(em, "give references talkie bot emss", {
      channel: "FD",
      candidateLimit: 250
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("u.tokens && array[?]::text[]");
    expect(sql).toContain("token = any(array[?]::text[])");
    expect(params[0]).toEqual(expect.arrayContaining(["give", "references", "talkie", "bot", "emss"]));
    expect(params[1]).toBe("FD");
    expect(params[2]).toBe("FD");
    expect(params[3]).toEqual(expect.arrayContaining(["talkie", "bot"]));
    expect(params[4]).toBe(250);

    expect(result).toEqual([
      {
        id: "42",
        timestamp: "2026-04-09T18:46:40.000Z",
        day: "2026-04-09",
        hour: "18:00",
        channel: "FD",
        durationSec: 8,
        language: "en",
        translated: "no",
        text: "Sample transcript line",
        tokens: ["sample", "transcript", "line"],
        filename: "transcript.csv",
        sourceFile: "source_files/transcript.csv"
      }
    ]);
  });
});
