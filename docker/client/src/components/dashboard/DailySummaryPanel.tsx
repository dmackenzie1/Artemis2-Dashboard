import type { FunctionComponent } from "react";
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
      className="daily-summary-panel"
      kicker="Operational Readout"
      title="Last 24 Hours"
      headerAccessory={<StatusBadge label={statusLabel} />}
      footer={<small className="subtle">{latestDay ? `Latest ingested day: ${latestDay}` : "No ingested day yet"}</small>}
    >
      {rows.length === 0 ? (
        <PaneStateMessage message="Building daily snapshot…" tone="loading" />
      ) : (
        <div className="summary-feed" role="list">
          {rows.map((row, index) => (
            <p key={`${row}-${index}`} role="listitem" className="summary-row">
              {row}
            </p>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
};
