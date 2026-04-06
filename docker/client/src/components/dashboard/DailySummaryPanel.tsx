import type { FunctionComponent } from "react";
import styles from "../../styles.module.css";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type DailySummaryPanelProps = {
  statusLabel: string;
  summaryText: string;
  latestDay: string | undefined;
};

const summarizeLines = (text: string): string[] => {
  return text
    .split(/\n+/u)
    .map((line) => line.replace(/^[-•*]\s*/u, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
};

const isWaitingState = (statusLabel: string): boolean => {
  return ["building", "querying", "not ready"].includes(statusLabel);
};

export const DailySummaryPanel: FunctionComponent<DailySummaryPanelProps> = ({
  statusLabel,
  summaryText,
  latestDay
}) => {
  const rows = summarizeLines(summaryText);
  const shouldShowWaiting = isWaitingState(statusLabel) || rows.length === 0;

  return (
    <DashboardPanel
      componentId="daily-summary-panel"
      className={styles["daily-summary-panel"]}
      kicker="Operational Readout"
      title="Last 24 Hours"
      headerAccessory={<StatusBadge label={statusLabel} />}
      footer={<small className={styles.subtle}>{latestDay ? `Latest ingested day: ${latestDay}` : "No ingested day yet"}</small>}
    >
      {shouldShowWaiting ? (
        <PaneStateMessage message="Waiting for results…" tone="loading" />
      ) : (
        <div className={styles["summary-feed"]} role="list">
          {rows.map((row, index) => (
            <p key={`${row}-${index}`} role="listitem" className={styles["summary-row"]}>
              {row}
            </p>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
};
