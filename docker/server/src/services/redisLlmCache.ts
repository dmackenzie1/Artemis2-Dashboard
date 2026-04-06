import { createClient } from "redis";
import { serverLogger } from "../utils/logging/serverLogger.js";
import type { LlmResponseCache } from "./llmClient.js";

export class RedisLlmCache implements LlmResponseCache {
  private connected = false;
  private readonly client;

  constructor(private readonly redisUrl: string) {
    this.client = createClient({
      url: this.redisUrl,
      socket: {
        reconnectStrategy: () => 5_000
      }
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.client.on("error", (error: unknown) => {
      serverLogger.warn("Redis client error", {
        error: error instanceof Error ? error.message : "Unknown redis error"
      });
    });

    await this.client.connect();
    this.connected = true;
    serverLogger.info("Redis cache connected", { redisUrl: this.redisUrl });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.quit();
    this.connected = false;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, { EX: ttlSeconds });
  }
}
