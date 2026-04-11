import type { FunctionComponent } from "react";
import { useEffect, useMemo, useState } from "react";
import { RecentWindowPanel } from "../components/dashboard/RecentWindowPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { UtterancesTimelinePanel } from "../components/dashboard/UtterancesTimelinePanel";
import { useComponentIdentity } from "../components/dashboard/primitives/useComponentIdentity";
import styles from "./DashboardPage.module.css";
import { useLocation } from "react-router-dom";
import { useLiveUpdates } from "../context/LiveUpdatesContext";

export const DashboardPage: FunctionComponent = () => {
  const { componentId, componentUid } = useComponentIdentity("dashboard-page");
  const [refreshToken, setRefreshToken] = useState(0);
  const location = useLocation();
  const { adminRefreshVersion, globalRefreshVersion, lastAdminRefreshAt } = useLiveUpdates();
  const adminMode = useMemo(() => {
    const adminQueryValue = new URLSearchParams(location.search).get("admin");
    return adminQueryValue === "true";
  }, [location.search]);

  useEffect(() => {
    setRefreshToken((previous) => previous + 1);
  }, [adminRefreshVersion, globalRefreshVersion]);

  return (
    <div className={styles["dashboard-layout"]} data-component-id={componentId} data-component-uid={componentUid}>
      <section className={styles["dashboard-text-pane"]} data-component-id="dashboard-text-pane" data-component-uid={`${componentUid}-text`}>
        <RecentWindowPanel refreshToken={refreshToken} />
      </section>
      <section className={styles["dashboard-side-pane"]} data-component-id="dashboard-side-pane" data-component-uid={`${componentUid}-side`}>
        <section className={styles["dashboard-stats-pane"]} data-component-id="dashboard-stats-pane" data-component-uid={`${componentUid}-stats`}>
          <StatsPanel refreshToken={refreshToken} />
        </section>
      </section>

      <section className={styles["dashboard-bottom-row"]} data-component-id="dashboard-bottom-row" data-component-uid={`${componentUid}-bottom`}>
        <UtterancesTimelinePanel refreshToken={refreshToken} />
      </section>
      {adminMode && lastAdminRefreshAt ? (
        <div className={styles["dashboard-admin-hint"]}>Refresh requested at {new Date(lastAdminRefreshAt).toLocaleTimeString()}.</div>
      ) : null}
    </div>
  );
};
