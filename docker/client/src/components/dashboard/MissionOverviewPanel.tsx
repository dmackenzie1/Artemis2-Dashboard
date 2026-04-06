import type { FunctionComponent } from "react";
import styles from "../../styles.shared.module.css";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type MissionOverviewPanelProps = {
  statusLabel: string;
  summaryText: string;
  lastRunAt: string | null;
};

export const MissionOverviewPanel: FunctionComponent<MissionOverviewPanelProps> = ({
  statusLabel,
  summaryText,
  lastRunAt
}) => {
  const hasSummary = summaryText.trim().length > 0;

  return (
    <DashboardPanel
      componentId="mission-overview-panel"
      className={styles["mission-summary-panel"]}
      kicker="Post-Mission Review"
      title="Mission Review Summary"
      headerAccessory={<StatusBadge label={statusLabel} />}
      footer={<small className={styles.subtle}>{lastRunAt ? `Run: ${lastRunAt}` : "Awaiting first run"}</small>}
    >
      {hasSummary ? (
        <div className={styles["summary-scroll-copy"]}>
          <div className={styles["formatted-copy"]}>{renderStructuredText(summaryText, styles["formatted-list"])}</div>
        </div>
      ) : (
        <PaneStateMessage message="Waiting for review highlights…" tone="loading" />
      )}
    </DashboardPanel>
  );
};
