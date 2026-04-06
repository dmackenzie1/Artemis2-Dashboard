import type { FunctionComponent } from "react";
import sharedStyles from "../../styles/shared.module.css";
import styles from "./DailySummaryPanel.module.css";
import { renderStructuredText } from "../../utils/formatting/renderStructuredText";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type DailySummaryPanelProps = {
  statusLabel: string;
  summaryText: string;
  latestDay: string | undefined;
};

const isWaitingState = (statusLabel: string): boolean => {
  return ["building", "querying", "not ready"].includes(statusLabel);
};

export const DailySummaryPanel: FunctionComponent<DailySummaryPanelProps> = ({
  statusLabel,
  summaryText,
  latestDay
}) => {
  const shouldShowWaiting = isWaitingState(statusLabel) || summaryText.trim().length === 0;

  return (
    <DashboardPanel
      componentId="daily-summary-panel"
      className={styles["daily-summary-panel"]}
      kicker="Recent Transcript Review"
      title="Latest TalkyBot Window"
      headerAccessory={<StatusBadge label={statusLabel} />}
      footer={<small className={sharedStyles.subtle}>{latestDay ? `Latest ingested day: ${latestDay}` : "No ingested day yet"}</small>}
    >
      {shouldShowWaiting ? (
        <PaneStateMessage message="Waiting for results…" tone="loading" />
      ) : (
        <div className={styles["summary-scroll-copy"]}>
          <div className={sharedStyles["formatted-copy"]}>{renderStructuredText(summaryText, sharedStyles["formatted-list"])}</div>
        </div>
      )}
    </DashboardPanel>
  );
};
