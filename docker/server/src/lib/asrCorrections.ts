import { readFileSync } from "node:fs";

type AsrCorrectionEntry = {
  canonical: string;
  aliases: string[];
  category: string;
  notes: string;
};

type AsrCorrectionDocument = {
  version: string;
  intent: string;
  entries: AsrCorrectionEntry[];
};

const cleanupWhitespace = (value: string): string => value.trim().replace(/\s+/gu, " ");

const normalizePhrase = (value: string): string => cleanupWhitespace(value.normalize("NFKC").toLowerCase());

const buildReplacementMap = (entries: AsrCorrectionEntry[]): Map<string, string> => {
  const replacements = new Map<string, string>();

  for (const entry of entries) {
    const canonical = normalizePhrase(entry.canonical);
    if (!canonical) {
      continue;
    }

    replacements.set(canonical, canonical);
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizePhrase(alias);
      if (normalizedAlias) {
        replacements.set(normalizedAlias, canonical);
      }
    }
  }

  return replacements;
};

const correctionDocument = JSON.parse(
  readFileSync(new URL("../config/asr-corrections.json", import.meta.url), "utf-8")
) as AsrCorrectionDocument;

const replacementMap = buildReplacementMap(correctionDocument.entries);

const acronymPattern = /^(otc|rtc|sw)-?(\d+)$/u;

export const normalizeTokenWithAsrCorrections = (token: string): string => {
  const normalizedToken = normalizePhrase(token);
  if (!normalizedToken) {
    return normalizedToken;
  }

  const directReplacement = replacementMap.get(normalizedToken);
  if (directReplacement) {
    return directReplacement;
  }

  const acronymMatch = normalizedToken.match(acronymPattern);
  if (acronymMatch) {
    return `${acronymMatch[1]}-${acronymMatch[2]}`;
  }

  return normalizedToken;
};

export const getAsrCorrectionDictionaryVersion = (): string => correctionDocument.version;
