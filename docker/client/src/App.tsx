import type { FC } from "react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { fetchHealth } from "./api";
import type { HealthData } from "./api";
import { StatusBadge } from "./components/dashboard/primitives/StatusBadge";
import { useComponentIdentity } from "./components/dashboard/primitives/useComponentIdentity";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyPage } from "./pages/DailyPage";
import styles from "./styles.module.css";
import { TimelinePage } from "./pages/TimelinePage";
import { TopicPage } from "./pages/TopicPage";
import { clientLogger } from "./utils/logging/clientLogger";

const HEALTH_POLL_INTERVAL_MS = 5 * 60 * 1000;

export const App: FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const { componentId, componentUid } = useComponentIdentity("app-shell");

  useEffect(() => {
    const loadHealth = async (): Promise<void> => {
      try {
        const payload = await fetchHealth();
        setHealth(payload);
      } catch (error) {
        clientLogger.error("Topbar health poll failed", { error });
      }
    };

    void loadHealth();
    const pollHandle = window.setInterval(() => {
      void loadHealth();
    }, HEALTH_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollHandle);
    };
  }, []);

  const connected = useMemo(() => (!health ? true : health.llm.connected), [health]);

  return (
    <div className={styles["app-shell"]} data-component-id={componentId} data-component-uid={componentUid}>
      <header className={styles.topbar}>
        <h1>Artemis 2 Mission Intelligence</h1>
        <nav className={styles["topbar-nav"]}>
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/daily">Daily</NavLink>
          <NavLink to="/timeline">Timeline</NavLink>
          <div className={styles["topbar-status"]} title={connected ? "LLM connected" : "LLM disconnected"}>
            <StatusBadge label={connected ? "connected" : "disconnected"} />
          </div>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/topics/:title" element={<TopicPage />} />
        </Routes>
      </main>
    </div>
  );
};
