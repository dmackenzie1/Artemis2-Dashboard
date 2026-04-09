import { EntityManager } from "@mikro-orm/postgresql";
import { dayjs } from "../lib/dayjs.js";
import { serverLogger } from "../utils/logging/serverLogger.js";
import { ExpiringCache } from "./expiringCache.js";

type EntityManagerProvider = () => EntityManager;
const statsFreshCacheTtlMs = 2 * 60 * 1000;
const statsStaleCacheTtlMs = 40 * 60 * 1000;

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

export type MissionStatsDailyVolume = {
  generatedAt: string;
  days: MissionStatsByDayEntry[];
};

export type MissionHourlyChannelEntry = {
  hour: string;
  channel: string;
  utterances: number;
};

export class StatsService {
  private readonly summaryCache = new ExpiringCache<MissionStatsSummary>(statsFreshCacheTtlMs, statsStaleCacheTtlMs);
  private readonly dailyCache = new ExpiringCache<MissionStatsByDayEntry[]>(statsFreshCacheTtlMs, statsStaleCacheTtlMs);
  private readonly hourlyCache = new ExpiringCache<MissionHourlyChannelEntry[]>(statsFreshCacheTtlMs, statsStaleCacheTtlMs);
  private readonly refreshInFlight = new Map<string, Promise<void>>();

  constructor(private readonly getEntityManager: EntityManagerProvider) {}

  async getSummary(): Promise<MissionStatsSummary> {
    return this.resolveWithStaleWhileRevalidate("summary", this.summaryCache, async () => {
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
    });
  }

  async getStatsByDay(): Promise<MissionStatsByDayEntry[]> {
    return this.resolveWithStaleWhileRevalidate("days", this.dailyCache, async () => {
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
    });
  }

  async getDailyVolume(days = 5): Promise<MissionStatsDailyVolume> {
    const safeDays = Math.min(Math.max(Math.floor(days), 1), 30);
    const entries = await this.getStatsByDay();
    const slicedEntries = entries.slice(Math.max(entries.length - safeDays, 0)).reverse();

    return {
      generatedAt: dayjs().utc().toISOString(),
      days: slicedEntries
    };
  }

  async getUtterancesPerHourPerChannel(days = 7): Promise<MissionHourlyChannelEntry[]> {
    const safeDays = Math.min(Math.max(days, 1), 30);
    const cacheKey = `hourly:${safeDays}`;
    return this.resolveWithStaleWhileRevalidate(cacheKey, this.hourlyCache, async () => {
      serverLogger.info("Running hourly channel stats query", { requestedDays: days, safeDays });
      const rows = await this.getEntityManager().getConnection().execute<
        { hour: string; channel: string; utterances: string }[]
      >(
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
    });
  }

  invalidateCaches(): void {
    this.summaryCache.clear();
    this.dailyCache.clear();
    this.hourlyCache.clear();
  }

  inspectCaches(): {
    summary: ReturnType<ExpiringCache<MissionStatsSummary>["inspect"]>;
    daily: ReturnType<ExpiringCache<MissionStatsByDayEntry[]>["inspect"]>;
    hourly: ReturnType<ExpiringCache<MissionHourlyChannelEntry[]>["inspect"]>;
  } {
    return {
      summary: this.summaryCache.inspect(),
      daily: this.dailyCache.inspect(),
      hourly: this.hourlyCache.inspect()
    };
  }

  async primeCoreCaches(): Promise<void> {
    await Promise.all([this.getSummary(), this.getStatsByDay()]);
  }

  private async resolveWithStaleWhileRevalidate<T>(
    cacheKey: string,
    cache: ExpiringCache<T>,
    loader: () => Promise<T>
  ): Promise<T> {
    const cached = cache.getWithStaleness(cacheKey);
    if (cached && !cached.isStale) {
      return cached.value;
    }

    if (cached && cached.isStale) {
      this.triggerBackgroundRefresh(cacheKey, cache, loader);
      return cached.value;
    }

    const value = await loader();
    cache.set(cacheKey, value);
    return value;
  }

  private triggerBackgroundRefresh<T>(cacheKey: string, cache: ExpiringCache<T>, loader: () => Promise<T>): void {
    if (this.refreshInFlight.has(cacheKey)) {
      return;
    }

    const refreshPromise = (async () => {
      try {
        const nextValue = await loader();
        cache.set(cacheKey, nextValue);
      } catch (error) {
        serverLogger.warn("Background cache refresh failed for stats query", {
          cacheKey,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      } finally {
        this.refreshInFlight.delete(cacheKey);
      }
    })();

    this.refreshInFlight.set(cacheKey, refreshPromise);
  }
}
