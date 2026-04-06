import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { fetchHealth, triggerPipelineRun } from "./api";
import type { HealthData } from "./api";
import { StatusBadge } from "./components/dashboard/primitives/StatusBadge";
import { useComponentIdentity } from "./components/dashboard/primitives/useComponentIdentity";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyPage } from "./pages/DailyPage";
import styles from "./App.module.css";
import { TimelinePage } from "./pages/TimelinePage";
import { TopicPage } from "./pages/TopicPage";
import { NotableMomentsPage } from "./pages/NotableMomentsPage";
import { SystemLogsPage } from "./pages/SystemLogsPage";
import { SignalChatPage } from "./pages/SignalChatPage";
import { clientLogger } from "./utils/logging/clientLogger";

const HEALTH_POLL_INTERVAL_MS = 60 * 1000;

export const App: FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [isAdminRefreshRunning, setIsAdminRefreshRunning] = useState(false);
  const location = useLocation();
  const { componentId, componentUid } = useComponentIdentity("app-shell");

  const refreshHealth = async (): Promise<HealthData | null> => {
    try {
      const payload = await fetchHealth();
      setHealth(payload);
      return payload;
    } catch (error) {
      clientLogger.error("Topbar health poll failed", { error });
      return null;
    }
  };

  useEffect(() => {
    void refreshHealth();
    const pollHandle = window.setInterval(() => {
      void refreshHealth();
    }, HEALTH_POLL_INTERVAL_MS);
    const onWindowFocus = (): void => {
      void refreshHealth();
    };
    window.addEventListener("focus", onWindowFocus);

    return () => {
      window.clearInterval(pollHandle);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, []);

  const connected = useMemo(() => (!health ? true : health.llm.connected), [health]);
  const adminMode = useMemo(() => {
    const adminQueryValue = new URLSearchParams(location.search).get("admin");
    return adminQueryValue === "true";
  }, [location.search]);

  const onAdminRefreshClick = async (): Promise<void> => {
    if (isAdminRefreshRunning) {
      return;
    }

    setIsAdminRefreshRunning(true);
    try {
      const result = await triggerPipelineRun();
      clientLogger.info("Admin-triggered pipeline refresh requested", { status: result.status, accepted: result.accepted });
      window.dispatchEvent(new Event("dashboard-admin-refresh-requested"));
    } catch (error) {
      clientLogger.error("Admin-triggered pipeline refresh failed", { error });
    } finally {
      setIsAdminRefreshRunning(false);
    }
  };

  const onReconnectClick = async (): Promise<void> => {
    if (isRefreshingHealth) {
      return;
    }

    setIsRefreshingHealth(true);
    try {
      const latestHealth = await refreshHealth();
      if (latestHealth?.llm.connected) {
        return;
      }

      await triggerPipelineRun();
      await refreshHealth();
    } catch (error) {
      clientLogger.error("LLM reconnect request failed", { error });
    } finally {
      setIsRefreshingHealth(false);
    }
  };

  return (
    <div className={styles["app-shell"]} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={styles.topbar}>
        <div className={styles["topbar-title"]}>
          <span className={styles["topbar-emblem"]} aria-hidden="true">
            A2
          </span>
          <h1>TalkyBot Transcript Review</h1>
        </div>
        <nav className={styles["topbar-nav"]}>
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/daily">Daily</NavLink>
          <NavLink to="/timeline">Timeline</NavLink>
          <NavLink to="/notable">Notable</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          <NavLink to="/system-logs">System Logs</NavLink>
          <a href="https://talkybot.fit.nasa.gov/" target="_blank" rel="noreferrer">
            TalkyBot
          </a>
          <div className={styles["topbar-status"]} title={connected ? "LLM connected" : "LLM disconnected"}>
            <StatusBadge label={connected ? "connected" : "disconnected"} />
          </div>
          {!connected ? (
            <button
              type="button"
              className={styles["reconnect-button"]}
              onClick={() => {
                void onReconnectClick();
              }}
              disabled={isRefreshingHealth}
              title="Retry LLM health check and trigger pipeline refresh"
            >
              {isRefreshingHealth ? "Reconnecting…" : "Reconnect LLM"}
            </button>
          ) : null}
          {adminMode ? (
            <button
              type="button"
              className={styles["admin-refresh-button"]}
              onClick={() => {
                void onAdminRefreshClick();
              }}
              disabled={isAdminRefreshRunning}
              title="Admin: rerun pipeline and refresh this page's queries"
            >
              ↻
            </button>
          ) : null}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/3-hour" element={<Navigate to="/daily" replace />} />
          <Route path="/6-hour" element={<Navigate to="/daily" replace />} />
          <Route path="/12-hour" element={<Navigate to="/daily" replace />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/notable" element={<NotableMomentsPage />} />
          <Route path="/talkierag" element={<Navigate to="/" replace />} />
          <Route path="/chat" element={<SignalChatPage />} />
          <Route path="/system-logs" element={<SystemLogsPage />} />
          <Route path="/topics/:title" element={<TopicPage />} />
        </Routes>
      </main>
    </div>
  );
};
