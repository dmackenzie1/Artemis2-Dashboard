import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SystemLogsService } from "./systemLogsService.js";

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "system-logs-service-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("SystemLogsService", () => {
  it("lists prompt submissions and llm debug files", async () => {
    const root = await createTempDir();
    const submissions = path.join(root, "prompt-submissions");
    const debug = path.join(root, "llm-debug");

    await mkdir(submissions, { recursive: true });
    await mkdir(path.join(debug, "query-set"), { recursive: true });
    await mkdir(path.join(debug, "query-receive"), { recursive: true });

    await writeFile(path.join(submissions, "20260406T000001-daily_summary.json"), "{}", "utf8");
    await writeFile(path.join(debug, "query-set", "request-1.json"), "{}", "utf8");
    await writeFile(path.join(debug, "query-receive", "response-1.json"), "{}", "utf8");

    const service = new SystemLogsService({
      promptSubmissionsDir: submissions,
      llmDebugPromptsDir: debug
    });

    const list = await service.listSystemLogs();
    expect(list.logs).toHaveLength(3);
    expect(list.logs.map((entry) => entry.category).sort()).toEqual(["prompt-incoming", "prompt-outgoing", "prompt-submission"]);

    const first = list.logs[0];
    expect(first).toBeTruthy();
    const filePayload = await service.getSystemLogById(first!.id);
    expect(filePayload?.content).toBe("{}");
  });

  it("rejects invalid ids", async () => {
    const service = new SystemLogsService({
      promptSubmissionsDir: "/tmp/no-submissions",
      llmDebugPromptsDir: "/tmp/no-debug"
    });

    const payload = await service.getSystemLogById("not-valid-base64");
    expect(payload).toBeNull();
  });
});
