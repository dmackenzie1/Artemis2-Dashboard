import { promises as fs } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

export const getPrompt = async (promptsDir: string, fileName: string): Promise<string> => {
  const key = `${promptsDir}:${fileName}`;
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const prompt = await fs.readFile(path.join(promptsDir, fileName), "utf8");
  cache.set(key, prompt);
  return prompt;
};
