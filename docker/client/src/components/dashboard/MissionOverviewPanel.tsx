import type { FunctionComponent } from "react";
import { DashboardPanel } from "./primitives/DashboardPanel";
import { PaneStateMessage } from "./primitives/PaneStateMessage";
import { StatusBadge } from "./primitives/StatusBadge";

type MissionOverviewPanelProps = {
  statusLabel: string;
  summaryText: string;
  lastRunAt: string | null;
};

const splitSummary = (text: string): { lead: string; bullets: string[] } => {
  const segments = text
    .split(/\n+/u)
    .map((segment) => segment.replace(/^[-•*]\s*/u, "").trim())
    .filter((segment) => segment.length > 0);

  const [lead, ...rest] = segments;

  return {
    lead: lead ?? text,
    bullets: rest.slice(0, 4)
  };
};

export const MissionOverviewPanel: FunctionComponent<MissionOverviewPanelProps> = ({
  statusLabel,
  summaryText,
  lastRunAt
}) => {
  const parsed = splitSummary(summaryText);

  return (
    <DashboardPanel
      className="mission-summary-panel"
      kicker="Mission Intelligence"
      title="Mission Summary"
      headerAccessory={<StatusBadge label={statusLabel} />}
      footer={<small className="subtle">{lastRunAt ? `Run: ${lastRunAt}` : "Awaiting first run"}</small>}
    >
      <p className="panel-lead">{parsed.lead}</p>
      {parsed.bullets.length > 0 ? (
        <>
          <p className="panel-meta-label">Key Points</p>
          <ul className="panel-bullets">
            {parsed.bullets.map((bullet, index) => (
              <li key={`${bullet}-${index}`}>{bullet}</li>
            ))}
          </ul>
        </>
      ) : (
        <PaneStateMessage message="Waiting for key points…" tone="loading" />
      )}
    </DashboardPanel>
  );
};
