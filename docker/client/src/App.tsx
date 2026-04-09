import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { clearServerCaches, triggerIngest } from "./api";
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
import { useLiveUpdates } from "./context/LiveUpdatesContext";

export const App: FC = () => {
  const [isAdminRefreshRunning, setIsAdminRefreshRunning] = useState(false);
  const [isEspressoBotVisible, setIsEspressoBotVisible] = useState(false);
  const emsspressobotRef = useRef<EmsspressobotController | null>(null);
  const location = useLocation();
  const { requestAdminRefresh } = useLiveUpdates();
  const { componentId, componentUid } = useComponentIdentity("app-shell");

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

  useEffect(() => {
    const cacheClearValue = new URLSearchParams(location.search).get("cacheClear");
    if (cacheClearValue !== "true") {
      return;
    }

    let cancelled = false;
    void clearServerCaches()
      .then((result) => {
        if (cancelled) {
          return;
        }
        clientLogger.info("Server caches cleared from query parameter trigger", result);
        requestAdminRefresh();
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        clientLogger.error("Failed to clear server caches from query parameter trigger", { error });
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        const params = new URLSearchParams(location.search);
        params.delete("cacheClear");
        const nextQuery = params.toString();
        const nextPath = `${location.pathname}${nextQuery ? `?${nextQuery}` : ""}${location.hash}`;
        window.history.replaceState({}, "", nextPath);
      });

    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search]);

  const onAdminRefreshClick = async (): Promise<void> => {
    if (isAdminRefreshRunning) {
      return;
    }

    setIsAdminRefreshRunning(true);
    try {
      const result = await triggerIngest();
      clientLogger.info("Admin-triggered full ingest refresh requested", {
        generatedAt: result.generatedAt,
        totalDays: result.days.length
      });
      requestAdminRefresh();
    } catch (error) {
      clientLogger.error("Admin-triggered full ingest refresh failed", { error });
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
          <NavLink to="/system-logs">System Status</NavLink>
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
              title="Admin: rerun ingest + pipeline + cache invalidation and refresh this page's queries"
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
