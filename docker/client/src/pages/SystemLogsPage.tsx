import type { FunctionComponent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  clearServerCaches,
  fetchPromptMatrixState,
  fetchSystemLogFile,
  fetchSystemLogs,
  triggerIngest,
  type PromptMatrixStateData,
  type SystemLogEntry,
  type SystemLogFileResponse,
  type SystemLogListResponse
} from "../api";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import sharedStyles from "../styles/shared.module.css";
import styles from "./SystemLogsPage.module.css";
import { clientLogger } from "../utils/logging/clientLogger";
import { useLiveUpdates } from "../context/LiveUpdatesContext";

const formatTimestamp = (value: string): string => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(timestamp);
};

const formatCompactUtc = (value: string): string => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const utcDate = new Date(timestamp);
  const year = `${utcDate.getUTCFullYear()}`;
  const month = `${utcDate.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${utcDate.getUTCDate()}`.padStart(2, "0");
  const hour = `${utcDate.getUTCHours()}`.padStart(2, "0");
  const minute = `${utcDate.getUTCMinutes()}`.padStart(2, "0");
  const second = `${utcDate.getUTCSeconds()}`.padStart(2, "0");

  return `${year}${month}${day}T${hour}${minute}${second}`;
};

export const SystemLogsPage: FunctionComponent = () => {
  const location = useLocation();
  const [data, setData] = useState<SystemLogListResponse | null>(null);
  const [selectedLog, setSelectedLog] = useState<SystemLogFileResponse | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [promptMatrix, setPromptMatrix] = useState<PromptMatrixStateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatrixLoading, setIsMatrixLoading] = useState(true);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isAdminActionRunning, setIsAdminActionRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { globalRefreshVersion, lastEvent, recentEvents } = useLiveUpdates();
  const { componentId, componentUid } = useComponentIdentity("system-logs-page");
  const adminMode = useMemo(() => new URLSearchParams(location.search).get("admin") === "true", [location.search]);

  const loadLogs = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchSystemLogs();
      setData(payload);

      if (!payload.logs.some((log) => log.id === selectedLogId)) {
        setSelectedLog(null);
        setSelectedLogId(null);
      }
    } catch (loadError) {
      clientLogger.error("System logs list failed to load", { error: loadError });
      setError("Unable to load system logs right now.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedLogId]);

  const loadPromptMatrix = useCallback(async (): Promise<void> => {
    setIsMatrixLoading(true);
    try {
      const payload = await fetchPromptMatrixState(11);
      setPromptMatrix(payload);
    } catch (loadError) {
      clientLogger.error("System status prompt matrix failed to load", { error: loadError });
      setError("Unable to load prompt matrix state right now.");
    } finally {
      setIsMatrixLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
    void loadPromptMatrix();
  }, [loadLogs, loadPromptMatrix]);

  useEffect(() => {
    if (globalRefreshVersion > 0) {
      void loadLogs();
      void loadPromptMatrix();
    }
  }, [globalRefreshVersion, loadLogs, loadPromptMatrix]);

  useEffect(() => {
    let reloadTimer: number | null = null;
    const queuePromptMatrixReload = (): void => {
      if (reloadTimer !== null) {
        window.clearTimeout(reloadTimer);
      }
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void loadPromptMatrix();
      }, 300);
    };

    if (
      lastEvent &&
      (lastEvent.type === "prompt.sent" ||
        lastEvent.type === "prompt.received" ||
        lastEvent.type === "prompt.error" ||
        lastEvent.type === "sql.jobs.completed" ||
        lastEvent.type === "date.updated")
    ) {
      queuePromptMatrixReload();
    }

    return () => {
      if (reloadTimer !== null) {
        window.clearTimeout(reloadTimer);
      }
    };
  }, [lastEvent, loadPromptMatrix]);

  const onClearCacheClick = async (): Promise<void> => {
    if (isAdminActionRunning) {
      return;
    }

    setIsAdminActionRunning(true);
    try {
      await clearServerCaches();
      void loadLogs();
      void loadPromptMatrix();
    } catch (adminError) {
      clientLogger.error("System status clear cache failed", { error: adminError });
      setError("Unable to clear caches right now.");
    } finally {
      setIsAdminActionRunning(false);
    }
  };

  const onRegenerateClick = async (): Promise<void> => {
    if (isAdminActionRunning) {
      return;
    }

    setIsAdminActionRunning(true);
    try {
      await triggerIngest();
      void loadLogs();
      void loadPromptMatrix();
    } catch (adminError) {
      clientLogger.error("System status regenerate failed", { error: adminError });
      setError("Unable to regenerate right now.");
    } finally {
      setIsAdminActionRunning(false);
    }
  };

  const matrixDays = promptMatrix?.days ?? [];
  const matrixRows = promptMatrix?.prompts ?? [];
  const symbolByState: Record<"none" | "sent" | "received" | "error", string> = {
    none: "-",
    sent: "/",
    received: "✓",
    error: "!"
  };

  const onLogSelect = async (entry: SystemLogEntry): Promise<void> => {
    setIsFileLoading(true);
    setSelectedLogId(entry.id);
    try {
      const payload = await fetchSystemLogFile(entry.id);
      setSelectedLog(payload);
    } catch (loadError) {
      clientLogger.error("System log file failed to load", { error: loadError, entryId: entry.id });
      setSelectedLog(null);
      setError("Unable to load selected system log file.");
    } finally {
      setIsFileLoading(false);
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selectedLog) {
      return "No log file selected.";
    }

    return `${selectedLog.entry.category} • ${selectedLog.entry.fileName}`;
  }, [selectedLog]);

  return (
    <section className={sharedStyles["timeline-page"]} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={sharedStyles["timeline-header"]}>
        <p className={sharedStyles["timeline-kicker"]}>Observability</p>
        <h2>System Status</h2>
        <p className={sharedStyles["timeline-subtitle"]}>
          Prompt lifecycle telemetry, ingestion records, and live event health across all active mission days.
        </p>
      </header>

      <section className={sharedStyles["timeline-controls"]}>
        <button
          type="button"
          className={sharedStyles["timeline-control-button"]}
          onClick={() => {
            void loadLogs();
          }}
          disabled={isLoading}
        >
          Refresh
        </button>
        {adminMode ? (
          <>
            <button
              type="button"
              className={sharedStyles["timeline-control-button"]}
              onClick={() => {
                void onClearCacheClick();
              }}
              disabled={isAdminActionRunning}
            >
              Clear Cache
            </button>
            <button
              type="button"
              className={sharedStyles["timeline-control-button"]}
              onClick={() => {
                void onRegenerateClick();
              }}
              disabled={isAdminActionRunning}
            >
              Re-gen All
            </button>
          </>
        ) : null}
      </section>

      {error ? <p className={sharedStyles["timeline-error"]}>{error}</p> : null}

      <section className={sharedStyles.panel}>
        <h3>Prompt Matrix ({matrixDays.length} day{matrixDays.length === 1 ? "" : "s"})</h3>
        <p className={sharedStyles.subtle}>
          Latest ingest at: {promptMatrix?.latestIngestAt ? `${formatCompactUtc(promptMatrix.latestIngestAt)} UTC` : "n/a"}
        </p>
        <p className={sharedStyles.subtle}>Legend: / sent/in-progress • ✓ received • ! error • - no execution</p>
        {isMatrixLoading ? <p className={sharedStyles.subtle}>Loading matrix…</p> : null}
        {!isMatrixLoading && matrixRows.length === 0 ? <p className={sharedStyles.subtle}>No prompt activity available yet.</p> : null}
        {!isMatrixLoading && matrixRows.length > 0 ? (
          <div className={styles["system-status-matrix-scroll"]}>
            <table className={styles["system-status-matrix"]}>
              <thead>
                <tr>
                  <th>Prompt</th>
                  {matrixDays.map((day) => (
                    <th key={`matrix-day-${day}`}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.key}>
                    <th>{row.key}</th>
                    {row.cells.map((cell) => (
                      <td
                        key={`${row.key}-${cell.day}`}
                        title={`${row.key} ${cell.day} • ${cell.state}${
                          cell.sentAt ? ` • sent ${formatCompactUtc(cell.sentAt)} UTC` : ""
                        }${cell.receivedAt ? ` • received ${formatCompactUtc(cell.receivedAt)} UTC` : ""}${
                          cell.errorMessage ? ` • ${cell.errorMessage}` : ""
                        }`}
                        data-state={cell.state}
                      >
                        <span className={styles["system-status-matrix-symbol"]}>{symbolByState[cell.state]}</span>
                        {cell.receivedAt || cell.sentAt ? (
                          <small className={styles["system-status-matrix-time"]}>
                            {formatCompactUtc(cell.receivedAt ?? cell.sentAt ?? "")}
                          </small>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles["system-logs-layout"]}>
        <article className={sharedStyles.panel}>
          <h3>Files ({data?.logs.length ?? 0})</h3>
          {isLoading ? <p className={sharedStyles.subtle}>Loading files…</p> : null}
          {!isLoading && (data?.logs.length ?? 0) === 0 ? <p className={sharedStyles.subtle}>No log files found yet.</p> : null}
          <ul className={styles["system-logs-list"]}>
            {(data?.logs ?? []).map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`${styles["system-logs-item"]} ${selectedLogId === entry.id ? styles["system-logs-item-selected"] : ""}`}
                  onClick={() => {
                    void onLogSelect(entry);
                  }}
                >
                  <span>{entry.category}</span>
                  <strong>{entry.fileName}</strong>
                  <small>{formatTimestamp(entry.modifiedAt)} UTC</small>
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className={sharedStyles.panel}>
          <h3>{selectedLabel}</h3>
          <textarea
            readOnly
            value={isFileLoading ? "Loading file…" : selectedLog?.content ?? "Select a file from the left panel."}
            className={styles["system-logs-textbox"]}
          />
        </article>
      </section>

      <section className={sharedStyles.panel}>
        <h3>Live Socket Event Stream ({recentEvents.length})</h3>
        {recentEvents.length === 0 ? <p className={sharedStyles.subtle}>Waiting for socket events…</p> : null}
        <ul className={styles["system-logs-list"]}>
          {recentEvents.map((event, index) => (
            <li key={`${event.type}-${event.emittedAt}-${index}`}>
              <div className={styles["system-logs-item"]}>
                <span>{event.type}</span>
                <strong>{formatTimestamp(event.emittedAt)} UTC</strong>
                <small>{JSON.stringify(event.payload ?? {}, null, 0)}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
