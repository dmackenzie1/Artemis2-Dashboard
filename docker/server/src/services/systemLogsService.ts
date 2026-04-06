import { promises as fs } from "node:fs";
import path from "node:path";
import { dayjs } from "../lib/dayjs.js";

const MAX_SYSTEM_LOG_FILES = 500;

export type SystemLogEntry = {
  id: string;
  category: "prompt-submission" | "prompt-outgoing" | "prompt-incoming";
  fileName: string;
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type SystemLogListResponse = {
  generatedAt: string;
  logs: SystemLogEntry[];
};

export type SystemLogFileResponse = {
  entry: Omit<SystemLogEntry, "absolutePath">;
  content: string;
};

type BuildSystemLogsServiceOptions = {
  promptSubmissionsDir: string;
  llmDebugPromptsDir: string;
};

const sortByMostRecent = (left: SystemLogEntry, right: SystemLogEntry): number => {
  return dayjs(right.modifiedAt).valueOf() - dayjs(left.modifiedAt).valueOf();
};

const encodeSystemLogId = (category: SystemLogEntry["category"], relativePath: string): string => {
  return Buffer.from(`${category}|${relativePath}`, "utf8").toString("base64url");
};

const decodeSystemLogId = (id: string): { category: SystemLogEntry["category"]; relativePath: string } | null => {
  try {
    const decoded = Buffer.from(id, "base64url").toString("utf8");
    const [category, ...pathParts] = decoded.split("|");
    const relativePath = pathParts.join("|");

    if (!relativePath || (category !== "prompt-submission" && category !== "prompt-outgoing" && category !== "prompt-incoming")) {
      return null;
    }

    return {
      category,
      relativePath
    };
  } catch (_error) {
    return null;
  }
};

const isPathInsideDirectory = (directory: string, targetPath: string): boolean => {
  const relative = path.relative(directory, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

export class SystemLogsService {
  constructor(private readonly options: BuildSystemLogsServiceOptions) {}

  private async listFilesForDirectory(directory: string, category: SystemLogEntry["category"]): Promise<SystemLogEntry[]> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const logs = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const absolutePath = path.join(directory, entry.name);
            const stat = await fs.stat(absolutePath);
            const relativePath = entry.name;

            return {
              id: encodeSystemLogId(category, relativePath),
              category,
              fileName: entry.name,
              relativePath,
              absolutePath,
              sizeBytes: stat.size,
              modifiedAt: dayjs(stat.mtime).utc().toISOString()
            } satisfies SystemLogEntry;
          })
      );

      return logs;
    } catch (_error) {
      return [];
    }
  }

  async listSystemLogs(): Promise<SystemLogListResponse> {
    const outgoingDirectory = path.join(this.options.llmDebugPromptsDir, "query-set");
    const incomingDirectory = path.join(this.options.llmDebugPromptsDir, "query-receive");

    const [submissions, outgoing, incoming] = await Promise.all([
      this.listFilesForDirectory(this.options.promptSubmissionsDir, "prompt-submission"),
      this.listFilesForDirectory(outgoingDirectory, "prompt-outgoing"),
      this.listFilesForDirectory(incomingDirectory, "prompt-incoming")
    ]);

    const logs = [...submissions, ...outgoing, ...incoming].sort(sortByMostRecent).slice(0, MAX_SYSTEM_LOG_FILES);

    return {
      generatedAt: dayjs().utc().toISOString(),
      logs
    };
  }

  async getSystemLogById(id: string): Promise<SystemLogFileResponse | null> {
    const parsed = decodeSystemLogId(id);
    if (!parsed) {
      return null;
    }

    const directoryByCategory: Record<SystemLogEntry["category"], string> = {
      "prompt-submission": this.options.promptSubmissionsDir,
      "prompt-outgoing": path.join(this.options.llmDebugPromptsDir, "query-set"),
      "prompt-incoming": path.join(this.options.llmDebugPromptsDir, "query-receive")
    };

    const rootDirectory = directoryByCategory[parsed.category];
    const absolutePath = path.resolve(rootDirectory, parsed.relativePath);

    if (!isPathInsideDirectory(rootDirectory, absolutePath)) {
      return null;
    }

    try {
      const [content, stat] = await Promise.all([fs.readFile(absolutePath, "utf8"), fs.stat(absolutePath)]);
      return {
        entry: {
          id,
          category: parsed.category,
          fileName: path.basename(absolutePath),
          relativePath: parsed.relativePath,
          sizeBytes: stat.size,
          modifiedAt: dayjs(stat.mtime).utc().toISOString()
        },
        content
      };
    } catch (_error) {
      return null;
    }
  }
}
