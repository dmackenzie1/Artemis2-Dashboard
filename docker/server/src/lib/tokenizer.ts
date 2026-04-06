import lodash from "lodash";
import { WordTokenizer } from "natural";

const tokenizer = new WordTokenizer();
const { deburr } = lodash;

const defaultStopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "could",
  "from",
  "have",
  "into",
  "just",
  "like",
  "maybe",
  "more",
  "only",
  "over",
  "same",
  "some",
  "than",
  "that",
  "the",
  "them",
  "then",
  "there",
  "they",
  "this",
  "those",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your"
]);

const sanitizeToken = (token: string): string => token.replace(/[^a-z0-9]/gu, "");

const tokenize = (value: string): string[] =>
  [
    ...new Set(
      tokenizer
        .tokenize(deburr(value).toLowerCase())
        .map((token) => sanitizeToken(token))
        .filter((token) => token.length >= 3)
        .filter((token) => !defaultStopWords.has(token))
    )
  ];

export const tokenizeUtterance = (value: string): string[] => tokenize(value);

export const tokenizeQuery = (value: string): string[] => tokenize(value);
