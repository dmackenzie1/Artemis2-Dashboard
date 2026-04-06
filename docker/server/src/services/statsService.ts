import { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../lib/dayjs.js";
import { serverLogger } from "../utils/logging/serverLogger.js";

type EntityManagerProvider = () => EntityManager;

export type MissionStatsSummary = {
  generatedAt: string;
  days: {
    minDay: string | null;
    maxDay: string | null;
  };
  totals: {
    utterances: number;
    words: number;
    channels: number;
  };
};

export type MissionStatsByDayEntry = {
  day: string;
  utterances: number;
  words: number;
  channels: number;
};

export type MissionHourlyChannelEntry = {
  hour: string;
  channel: string;
  utterances: number;
};

export class StatsService {
  constructor(private readonly getEntityManager: EntityManagerProvider) {}

  async getSummary(): Promise<MissionStatsSummary> {
    const [summary] = await this.getEntityManager().getConnection().execute<
      {
        minDay: string | null;
        maxDay: string | null;
        utterances: string;
        words: string;
        channels: string;
      }[]
    >(
      `
        select
          min(date(timestamp at time zone 'utc'))::text as "minDay",
          max(date(timestamp at time zone 'utc'))::text as "maxDay",
          count(*)::text as "utterances",
          coalesce(sum(word_count), 0)::text as "words",
          count(distinct nullif(trim(channel), ''))::text as "channels"
        from transcript_utterances
      `
    );

    return {
      generatedAt: dayjs().utc().toISOString(),
      days: {
        minDay: summary?.minDay ?? null,
        maxDay: summary?.maxDay ?? null
      },
      totals: {
        utterances: Number(summary?.utterances ?? 0),
        words: Number(summary?.words ?? 0),
        channels: Number(summary?.channels ?? 0)
      }
    };
  }

  async getStatsByDay(): Promise<MissionStatsByDayEntry[]> {
    const rows = await this.getEntityManager().getConnection().execute<
      { day: string; utterances: string; words: string; channels: string }[]
    >(
      `
        select
          date(timestamp at time zone 'utc')::text as "day",
          count(*)::text as "utterances",
          coalesce(sum(word_count), 0)::text as "words",
          count(distinct nullif(trim(channel), ''))::text as "channels"
        from transcript_utterances
        group by 1
        order by 1 asc
      `
    );

    return rows.map((row) => ({
      day: row.day,
      utterances: Number(row.utterances),
      words: Number(row.words),
      channels: Number(row.channels)
    }));
  }

  async getUtterancesPerHourPerChannel(days = 7): Promise<MissionHourlyChannelEntry[]> {
    const safeDays = Math.min(Math.max(days, 1), 30);
    serverLogger.info("Running hourly channel stats query", { requestedDays: days, safeDays });
    const rows = await this.getEntityManager().getConnection().execute<{ hour: string; channel: string; utterances: string }[]>(
      `
        with max_day as (
          select max(date(timestamp at time zone 'utc')) as value
          from transcript_utterances
        ),
        scoped as (
          select
            date_trunc('hour', timestamp) as bucket_hour,
            channel
          from transcript_utterances
          cross join max_day
          where max_day.value is not null
            and date(timestamp at time zone 'utc') >= max_day.value - ((${safeDays} - 1) * interval '1 day')
        )
        select
          to_char(scoped.bucket_hour at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as "hour",
          scoped.channel as "channel",
          count(*)::text as "utterances"
        from scoped
        group by 1, 2
        order by 1 asc, 2 asc
      `
    );

    return rows.map((row) => ({
      hour: row.hour,
      channel: row.channel,
      utterances: Number(row.utterances)
    }));
  }
}
