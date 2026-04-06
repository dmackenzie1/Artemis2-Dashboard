type CacheEntry<T> = {
  expiresAtMs: number;
  value: T;
};

export class ExpiringCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAtMs) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, {
      expiresAtMs: Date.now() + this.ttlMs,
      value
    });
  }

  clear(): void {
    this.entries.clear();
  }
}
