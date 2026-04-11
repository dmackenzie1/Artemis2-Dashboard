import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingestCsvDirectory } from "./csvIngest.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map(async (directoryPath) => rm(directoryPath, { recursive: true, force: true })));
  tempDirectories.length = 0;
});

describe("ingestCsvDirectory", () => {
  it("parses rows when audioFileName/text fields include unescaped quote characters", async () => {
    const directoryPath = await mkdtemp(path.join(tmpdir(), "csv-ingest-"));
    tempDirectories.push(directoryPath);

    const csvContent = [
      "Date,Channel,Duration,Language,Translated,Text,audioFileName",
      "2026-04-05T21:00:00Z,FLIGHT,00:30,en,Nominal,Crew reported stowage size 2'6\" in transfer bag,log-1.csv"
    ].join("\n");

    await writeFile(path.join(directoryPath, "quotes.csv"), csvContent, "utf-8");

    const utterances = await ingestCsvDirectory(directoryPath);

    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.text).toContain("2'6\"");
    expect(utterances[0]?.audioFileName).toBe("log-1.csv");
  });
});
