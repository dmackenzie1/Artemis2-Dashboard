import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptUtterance } from "../entities/TranscriptUtterance.js";
import { ingestTranscriptCsvDirectory } from "./transcriptIngestionService.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map(async (directoryPath) => rm(directoryPath, { recursive: true, force: true })));
  tempDirectories.length = 0;
});

describe("ingestTranscriptCsvDirectory", () => {
  it("continues ingestion when rows are malformed and preserves single quotes in text", async () => {
    const directoryPath = await mkdtemp(path.join(tmpdir(), "transcript-ingest-"));
    tempDirectories.push(directoryPath);

    const malformedCsvContent = [
      "Date,Channel,Duration,Language,Translated,Text,Filename",
      "2026-04-05T21:01:00Z,FLIGHT,00:30,en,No,\"broken quote line,log-2.csv"
    ].join("\n");

    const validCsvContent = [
      "Date,Channel,Duration,Language,Translated,Text,Filename",
      "2026-04-05T21:00:00Z,FLIGHT,00:30,en,No,Crew reported stowage size 2'6\" in transfer bag,log-1.csv"
    ].join("\n");

    await writeFile(path.join(directoryPath, "00-malformed.csv"), malformedCsvContent, "utf-8");
    await writeFile(path.join(directoryPath, "01-valid.csv"), validCsvContent, "utf-8");

    const insertedBatches: Array<Array<Omit<TranscriptUtterance, "id">>> = [];
    const em = {
      count: vi
        .fn()
        .mockResolvedValueOnce(17)
        .mockImplementation(async () => insertedBatches.flat().length),
      nativeDelete: vi.fn().mockResolvedValue(undefined),
      insertMany: vi.fn(async (_entity: unknown, rows: Array<Omit<TranscriptUtterance, "id">>) => {
        insertedBatches.push(rows);
      })
    } as unknown as Parameters<typeof ingestTranscriptCsvDirectory>[1];

    const summary = await ingestTranscriptCsvDirectory(directoryPath, em);

    const allInsertedRows = insertedBatches.flat();

    expect(summary.filesProcessed).toBe(2);
    expect(summary.inserted).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.parseErrors).toBe(1);
    expect(summary.utterancesInDatabase).toBe(1);
    expect(allInsertedRows).toHaveLength(1);
    expect(allInsertedRows[0]?.text).toContain("2'6\"");
    expect(em.nativeDelete).toHaveBeenCalledWith(TranscriptUtterance, {});
  });
});
