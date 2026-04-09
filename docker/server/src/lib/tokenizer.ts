import winkTokenizer from "wink-tokenizer";
import { removeStopwords } from "stopword";
import { normalizeTokenWithAsrCorrections } from "./asrCorrections.js";

const tokenizer = winkTokenizer();
const MIN_TOKEN_LENGTH = 3;

const normalizeText = (text: string): string => text.normalize("NFKC").toLowerCase();

const normalizeTokenStream = (tokens: string[]): string[] => {
  const normalized: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const current = normalizeTokenWithAsrCorrections(tokens[index] ?? "");
    const next = normalizeTokenWithAsrCorrections(tokens[index + 1] ?? "");

    if ((current === "saw" || current === "sw") && /^\d+$/u.test(next)) {
      normalized.push(`sw-${next}`);
      index += 1;
      continue;
    }

    if ((current === "otc" || current === "rtc") && /^\d+$/u.test(next)) {
      normalized.push(`${current}-${next}`);
      index += 1;
      continue;
    }

    normalized.push(current);
  }

  return normalized;
};

const tokenize = (text: string): string[] => {
  const normalized = normalizeText(text);
  const rawTokens = normalizeTokenStream(
    tokenizer
    .tokenize(normalized)
    .filter((token) => token.tag === "word" || token.tag === "number")
    .map((token) => token.value.trim())
  )
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);

  const withoutStopWords = removeStopwords(rawTokens);
  return [...new Set(withoutStopWords)];
};

export const tokenizeQuery = (text: string): string[] => tokenize(text);

export const tokenizeUtterance = (text: string): string[] => tokenize(text);
