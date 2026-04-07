import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { triggerPipelineRun } from "./api";
import { useComponentIdentity } from "./components/dashboard/primitives/useComponentIdentity";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyPage } from "./pages/DailyPage";
import styles from "./App.module.css";
import { TimelinePage } from "./pages/TimelinePage";
import { TopicPage } from "./pages/TopicPage";
import { NotableMomentsPage } from "./pages/NotableMomentsPage";
import { SystemLogsPage } from "./pages/SystemLogsPage";
import { SignalChatPage } from "./pages/SignalChatPage";
import { AboutPage } from "./pages/AboutPage";
import { clientLogger } from "./utils/logging/clientLogger";
import type { EmsspressobotController } from "./utils/emsspressobot";
import { installEmsspressobot } from "./utils/emsspressobot";
import { subscribeToLiveUpdates } from "./utils/live/liveEvents";

const HEALTH_POLL_INTERVAL_MS = 5 * 60 * 1000;

export const App: FC = () => {
  const [isAdminRefreshRunning, setIsAdminRefreshRunning] = useState(false);
  const [isEspressoBotVisible, setIsEspressoBotVisible] = useState(false);
  const emsspressobotRef = useRef<EmsspressobotController | null>(null);
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

  useEffect(() => {
    const subscription = subscribeToLiveUpdates((event) => {
      if (event.type === "llm.connectivity.changed") {
        void refreshHealth();
      }
    });

    return () => {
      subscription.close();
    };
  }, []);

  const connected = useMemo(() => (!health ? true : health.llm.connected), [health]);
  const reconnectButtonLabel = useMemo(() => {
    if (reconnectState === "checking") {
      return "Checking…";
    }

    if (reconnectState === "reconnecting") {
      return "Reconnecting…";
    }

    if (reconnectState === "pipeline-running") {
      return "Pipeline running…";
    }

    return "Reconnect LLM";
  }, [reconnectState]);
  const adminMode = useMemo(() => {
    const adminQueryValue = new URLSearchParams(location.search).get("admin");
    return adminQueryValue === "true";
  }, [location.search]);

  useEffect(() => {
    if (isEspressoBotVisible) {
      emsspressobotRef.current = installEmsspressobot();
      return () => {
        emsspressobotRef.current?.remove();
        emsspressobotRef.current = null;
      };
    }

    emsspressobotRef.current?.remove();
    emsspressobotRef.current = null;

    return undefined;
  }, [isEspressoBotVisible]);

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
          <NavLink to="/about">About</NavLink>
          <a href="https://talkybot.fit.nasa.gov/" target="_blank" rel="noreferrer">
            TalkyBot
          </a>
          <button
            type="button"
            className={styles["espresso-toggle-button"]}
            aria-pressed={isEspressoBotVisible}
            onClick={() => {
              setIsEspressoBotVisible((visible) => !visible);
            }}
            title={isEspressoBotVisible ? "Hide EMSSpressoBot" : "Show EMSSpressoBot"}
          >
            ☕
          </button>
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
          <Route path="/about" element={<AboutPage />} />
          <Route path="/topics/:title" element={<TopicPage />} />
        </Routes>
      </main>
    </div>
  );
};
