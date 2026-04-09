import { dayjs } from "../lib/dayjs.js";
import { tokenizeQuery, tokenizeUtterance } from "../lib/tokenizer.js";
import type { TranscriptUtterance } from "../types.js";

export type RankedUtterance = {
  timestamp: string;
  day: string;
  channel: string;
  text: string;
  filename: string;
  source: string;
  score: number;
};

type RetrievalResult = {
  queryTokens: string[];
  ranked: RankedUtterance[];
  daysQueried: number;
};

const HIGH_SIGNAL_PATTERN = /\b(anomaly|issue|risk|warning|fault|fail|leak|urgent|degraded|concern)\b/i;

const toRankedUtterance = (utterance: TranscriptUtterance, score: number): RankedUtterance => ({
  timestamp: utterance.timestamp,
  day: utterance.day,
  channel: utterance.channel,
  text: utterance.text,
  filename: utterance.filename,
  source: utterance.sourceFile,
  score: Number(score.toFixed(4))
});

const clampLimit = (limit: number, defaultLimit = 8): number => {
  if (!Number.isFinite(limit)) {
    return defaultLimit;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 25);
};

const rankUtterances = (queryTokens: string[], utterances: TranscriptUtterance[]): Array<{ utterance: TranscriptUtterance; score: number }> => {
  if (queryTokens.length === 0) {
    return [];
  }

  return utterances
    .map((utterance) => {
      const utteranceTokens = utterance.tokens && utterance.tokens.length > 0 ? utterance.tokens : tokenizeUtterance(utterance.text);
      if (utteranceTokens.length === 0) {
        return null;
      }

      const tokenSet = new Set(utteranceTokens);
      const overlapCount = queryTokens.filter((token) => tokenSet.has(token)).length;
      if (overlapCount === 0) {
        return null;
      }

      const overlapScore = overlapCount / queryTokens.length;
      const coverageScore = overlapCount / utteranceTokens.length;
      const signalBoost = HIGH_SIGNAL_PATTERN.test(utterance.text) ? 0.12 : 0;
      const channelBoost = /flight|manager|eclss|fdo|gnc/i.test(utterance.channel) ? 0.08 : 0;
      const recencyBoost = Math.max(0, 1 - dayjs().utc().diff(dayjs(utterance.timestamp), "day") / 30) * 0.06;

      const score = overlapScore * 0.64 + coverageScore * 0.24 + signalBoost + channelBoost + recencyBoost;

      return {
        utterance,
        score
      };
    })
    .filter((entry): entry is { utterance: TranscriptUtterance; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score);
};

export const retrieveRankedUtterances = (
  query: string,
  utterances: TranscriptUtterance[],
  limit = 8
): RetrievalResult => {
  const queryTokens = tokenizeQuery(query);
  const ranked = rankUtterances(queryTokens, utterances)
    .slice(0, clampLimit(limit))
    .map(({ utterance, score }) => toRankedUtterance(utterance, score));

  const daysQueried = new Set(ranked.map((entry) => entry.day)).size;

  return {
    queryTokens,
    ranked,
    daysQueried
  };
};
