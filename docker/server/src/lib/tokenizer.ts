import winkTokenizer from "wink-tokenizer";
import { removeStopwords } from "stopword";

const tokenizer = winkTokenizer();
const MIN_TOKEN_LENGTH = 3;

const normalizeText = (text: string): string => text.normalize("NFKC").toLowerCase();

const tokenize = (text: string): string[] => {
  const normalized = normalizeText(text);
  const rawTokens = tokenizer
    .tokenize(normalized)
    .filter((token) => token.tag === "word")
    .map((token) => token.value.trim())
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);

  const withoutStopWords = removeStopwords(rawTokens);
  return [...new Set(withoutStopWords)];
};

export const tokenizeQuery = (text: string): string[] => tokenize(text);

export const tokenizeUtterance = (text: string): string[] => tokenize(text);
