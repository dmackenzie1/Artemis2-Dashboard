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

export const DailySummaryPanel: FunctionComponent<DailySummaryPanelProps> = ({
  statusLabel,
  summaryText,
  latestDay
}) => {
  const rows = summarizeLines(summaryText);

  return (
    <DashboardPanel
      componentId="daily-summary-panel"
      className={styles["daily-summary-panel"]}
      kicker="Operational Readout"
      title="Last 24 Hours"
      headerAccessory={<StatusBadge label={statusLabel} />}
      footer={<small className={styles.subtle}>{latestDay ? `Latest ingested day: ${latestDay}` : "No ingested day yet"}</small>}
    >
      {rows.length === 0 ? (
        <>
          <PaneStateMessage message="Building daily snapshot…" tone="loading" />
          <div className={styles["summary-skeleton-grid"]} aria-hidden="true">
            <div className={styles["skeleton-row"]} />
            <div className={styles["skeleton-row"]} />
            <div className={styles["skeleton-row"]} />
          </div>
        </>
      ) : (
        <div className={styles["summary-feed"]} role="list">
          {rows.map((row, index) => (
            <p key={`${row}-${index}`} role="listitem" className={styles["summary-row"]}>
              <span className={styles["summary-row-index"]}>{String(index + 1).padStart(2, "0")}</span>
              <span>{row}</span>
            </p>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
};
