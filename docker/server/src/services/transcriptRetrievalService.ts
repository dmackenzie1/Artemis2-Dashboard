import { dayjs } from "../lib/dayjs.js";
import { tokenizeQuery, tokenizeUtterance } from "../lib/tokenizer.js";
import type { TranscriptUtterance } from "../types.js";

export type RankedUtterance = {
  timestamp: string;
  day: string;
  channel: string;
  text: string;
  audioFileName: string;
  source: string;
  score: number;
};

type RetrievalResult = {
  queryTokens: string[];
  ranked: RankedUtterance[];
  daysQueried: number;
};

const HIGH_SIGNAL_PATTERN = /\b(anomaly|issue|risk|warning|fault|fail|leak|urgent|degraded|concern)\b/i;
const CREW_CHANNEL_PATTERN = /\b(oe1|oe2|1oe|2oe|xpl\s*1\s*0\/?oe|spaceoe)\b/i;
const FLIGHT_COORDINATION_CHANNEL_PATTERN = /\b(flight director|flight|iss|manager|orion|mer|fdo|gnc|eclss|eec)\b/i;

const toRankedUtterance = (utterance: TranscriptUtterance, score: number): RankedUtterance => ({
  timestamp: utterance.timestamp,
  day: utterance.day,
  channel: utterance.channel,
  text: utterance.text,
  audioFileName: utterance.audioFileName,
  source: utterance.sourceFile,
  score: Number(score.toFixed(4))
});

const clampLimit = (limit: number, defaultLimit = 20): number => {
  if (!Number.isFinite(limit)) {
    return defaultLimit;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 40);
};

const scoreChannelPriority = (channel: string): number => {
  if (CREW_CHANNEL_PATTERN.test(channel)) {
    return 0.16;
  }

  if (FLIGHT_COORDINATION_CHANNEL_PATTERN.test(channel)) {
    return 0.08;
  }

  return 0;
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
      const channelBoost = scoreChannelPriority(utterance.channel);
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
  limit: number | null = 20
): RetrievalResult => {
  const queryTokens = tokenizeQuery(query);
  const rankedEntries = rankUtterances(queryTokens, utterances);
  const limitedRankedEntries = limit === null ? rankedEntries : rankedEntries.slice(0, clampLimit(limit));
  const ranked = limitedRankedEntries.map(({ utterance, score }) => toRankedUtterance(utterance, score));

  const daysQueried = new Set(ranked.map((entry) => entry.day)).size;

  return {
    queryTokens,
    ranked,
    daysQueried
  };
};
