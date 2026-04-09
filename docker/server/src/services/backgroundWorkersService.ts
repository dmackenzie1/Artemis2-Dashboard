import type { LlmClient, LlmConnectivityStatus } from "./llmClient.js";
import { liveUpdateBus } from "./liveUpdateBus.js";
import type { IngestionSchedulerService } from "./ingestionSchedulerService.js";

export type BackgroundWorkersServiceOptions = {
  llmClient: LlmClient;
  ingestionScheduler: IngestionSchedulerService;
  llmConnectivityProbeIntervalMs?: number;
};

const DEFAULT_LLM_CONNECTIVITY_PROBE_INTERVAL_MS = 5 * 60 * 1000;

export class BackgroundWorkersService {
  private llmConnectivityStatus: LlmConnectivityStatus = {
    connected: false,
    model: null,
    baseUrl: null,
    checkedAt: new Date(0).toISOString(),
    error: "not-yet-checked"
  };

  private llmConnectivityIntervalHandle: NodeJS.Timeout | null = null;

  public constructor(private readonly options: BackgroundWorkersServiceOptions) {}

  public async initializeLlmConnectivityStatus(): Promise<void> {
    this.llmConnectivityStatus = await this.options.llmClient.checkConnectivity();
  }

  public getLlmConnectivityStatus(): LlmConnectivityStatus {
    return this.llmConnectivityStatus;
  }

  public async startOnServerReady(): Promise<void> {
    await this.options.ingestionScheduler.runStartupIngestion();
    this.options.ingestionScheduler.startBackgroundWorkers();
    this.startLlmConnectivityPolling();
  }

  public stop(): void {
    if (this.llmConnectivityIntervalHandle) {
      clearInterval(this.llmConnectivityIntervalHandle);
      this.llmConnectivityIntervalHandle = null;
    }
  }

  private startLlmConnectivityPolling(): void {
    if (this.llmConnectivityIntervalHandle) {
      return;
    }

    this.llmConnectivityIntervalHandle = setInterval(() => {
      this.options.llmClient
        .checkConnectivity()
        .then((status) => {
          const statusChanged =
            status.connected !== this.llmConnectivityStatus.connected ||
            status.model !== this.llmConnectivityStatus.model ||
            status.baseUrl !== this.llmConnectivityStatus.baseUrl ||
            status.error !== this.llmConnectivityStatus.error;
          this.llmConnectivityStatus = status;
          if (statusChanged) {
            liveUpdateBus.publish({
              type: "llm.connectivity.changed",
              payload: {
                connected: status.connected,
                model: status.model,
                baseUrl: status.baseUrl,
                error: status.error
              }
            });
          }
        })
        .catch(() => {
          // no-op
        });
    }, this.options.llmConnectivityProbeIntervalMs ?? DEFAULT_LLM_CONNECTIVITY_PROBE_INTERVAL_MS);
  }
}
