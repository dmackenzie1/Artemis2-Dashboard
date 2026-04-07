import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { RecentWindowPanel } from "../components/dashboard/RecentWindowPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { UtterancesTimelinePanel } from "../components/dashboard/UtterancesTimelinePanel";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "./DashboardPage.module.css";
import { useLocation } from "react-router-dom";
import { subscribeToLiveUpdates } from "../utils/live/liveEvents";

export const DashboardPage: FunctionComponent = () => {
  const { componentId, componentUid } = useComponentIdentity("dashboard-page");
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const location = useLocation();
  const adminMode = useMemo(() => {
    const adminQueryValue = new URLSearchParams(location.search).get("admin");
    return adminQueryValue === "true";
  }, [location.search]);

  useEffect(() => {
    const handleAdminRefresh = (): void => {
      setRefreshToken((previous) => previous + 1);
      setLastRefreshAt(new Date().toISOString());
    };

    window.addEventListener("dashboard-admin-refresh-requested", handleAdminRefresh);
    return () => {
      window.removeEventListener("dashboard-admin-refresh-requested", handleAdminRefresh);
    };
  }, []);

  useEffect(() => {
    const subscription = subscribeToLiveUpdates((event) => {
      if (
        event.type === "dashboard.cache.updated" ||
        event.type === "stats.updated" ||
        event.type === "time-window-summary.updated" ||
        event.type === "pipeline.run.completed"
      ) {
        setRefreshToken((previous) => previous + 1);
        setLastRefreshAt(event.emittedAt);
      }
    });

    return () => {
      subscription.close();
    };
  }, []);

  return (
    <div className={styles["dashboard-layout"]} data-component-id={componentId} data-component-uid={componentUid}>
      <section className={styles["dashboard-top-row"]} data-component-id="dashboard-top-row" data-component-uid={`${componentUid}-top`}>
        <RecentWindowPanel refreshToken={refreshToken} />
        <StatsPanel refreshToken={refreshToken} />
      </section>

      <section className={styles["dashboard-mid-row"]} data-component-id="dashboard-mid-row" data-component-uid={`${componentUid}-mid`}>
        <MissionOverviewPanel refreshToken={refreshToken} />
        <MissionChatPanel />
      </section>

      <section className={styles["dashboard-bottom-row"]} data-component-id="dashboard-bottom-row" data-component-uid={`${componentUid}-bottom`}>
        <UtterancesTimelinePanel refreshToken={refreshToken} />
      </section>
      {adminMode && lastRefreshAt ? (
        <div className={styles["dashboard-admin-hint"]}>Refresh requested at {new Date(lastRefreshAt).toLocaleTimeString()}.</div>
      ) : null}
    </div>
  );
};
