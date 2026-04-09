import type { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../lib/dayjs.js";
import { tokenizeQuery } from "../lib/tokenizer.js";
import type { TranscriptUtterance } from "../types.js";

export type TranscriptCandidateFilters = {
  channel?: string;
  candidateLimit?: number;
};

const clampCandidateLimit = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 2000;
  }

  return Math.min(Math.max(Math.trunc(value ?? 2000), 100), 5000);
};

export const loadTranscriptCandidates = async (
  em: EntityManager,
  query: string,
  filters: TranscriptCandidateFilters = {}
): Promise<TranscriptUtterance[]> => {
  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const normalizedChannel = filters.channel?.trim() ?? "";
  const channelFilter = normalizedChannel.length > 0 ? normalizedChannel : null;
  const candidateLimit = clampCandidateLimit(filters.candidateLimit);
  const rows = await em.getConnection().execute<{
    id: number;
    timestamp: string | Date;
    channel: string;
    durationSec: number;
    language: string;
    translated: boolean;
    text: string;
    filename: string;
    sourceFile: string;
    tokens: string[];
  }[]>(
    `
      select
        u.id,
        u.timestamp,
        u.channel,
        u.duration_sec as "durationSec",
        u.language,
        u.translated,
        u.text,
        u.filename,
        u.source_file as "sourceFile",
        u.tokens
      from transcript_utterances u
      where u.tokens && ?::text[]
        and (?::text is null or lower(u.channel) = lower(?::text))
      order by
        (
          select count(*)::int
          from unnest(u.tokens) as token
          where token = any(?::text[])
        ) desc,
        u.timestamp desc
      limit ?;
    `,
    [queryTokens, channelFilter, channelFilter, queryTokens, candidateLimit]
  );

  return rows.map((row) => {
    const timestamp = dayjs(row.timestamp).utc();
    return {
      id: String(row.id),
      timestamp: timestamp.toISOString(),
      day: timestamp.format("YYYY-MM-DD"),
      hour: timestamp.format("HH:00"),
      channel: row.channel,
      durationSec: row.durationSec,
      language: row.language,
      translated: row.translated ? "yes" : "no",
      text: row.text,
      tokens: row.tokens,
      filename: row.filename,
      sourceFile: row.sourceFile
    };
  });
};
