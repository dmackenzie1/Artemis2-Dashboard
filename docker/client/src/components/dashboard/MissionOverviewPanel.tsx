import type { FunctionComponent } from "react";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./MissionOverviewPanel.module.css";
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
      footer={<small className={sharedStyles.subtle}>{lastRunAt ? `Run: ${lastRunAt}` : "Awaiting first run"}</small>}
    >
      {hasSummary ? (
        <div className={styles["summary-scroll-copy"]}>
          <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(summaryText, sharedStyles["formatted-list"])}</div>
        </div>
      ) : (
        <PaneStateMessage message="Waiting for review highlights…" tone="loading" />
      )}
    </DashboardPanel>
  );
};
