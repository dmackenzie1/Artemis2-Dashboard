type CacheEntry<T> = {
  freshUntilMs: number;
  staleUntilMs: number;
  value: T;
};

export type CachedValueState<T> = {
  value: T;
  isStale: boolean;
};

export class ExpiringCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly freshTtlMs: number,
    private readonly staleTtlMs = 0
  ) {}

  get(key: string): T | null {
    const entry = this.getWithStaleness(key);
    if (!entry || entry.isStale) {
      return null;
    }

    return entry.value;
  }

  getWithStaleness(key: string): CachedValueState<T> | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now >= entry.staleUntilMs) {
      this.entries.delete(key);
      return null;
    }

    return {
      value: entry.value,
      isStale: now >= entry.freshUntilMs
    };
  }

  set(key: string, value: T): void {
    const now = Date.now();
    this.entries.set(key, {
      freshUntilMs: now + this.freshTtlMs,
      staleUntilMs: now + this.freshTtlMs + this.staleTtlMs,
      value
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  inspect(): {
    size: number;
    keys: Array<{
      key: string;
      isStale: boolean;
      freshUntilMs: number;
      staleUntilMs: number;
    }>;
  } {
    const now = Date.now();
    const keys = [...this.entries.entries()].map(([key, entry]) => ({
      key,
      isStale: now >= entry.freshUntilMs,
      freshUntilMs: entry.freshUntilMs,
      staleUntilMs: entry.staleUntilMs
    }));

    return {
      size: this.entries.size,
      keys
    };
  }
}
