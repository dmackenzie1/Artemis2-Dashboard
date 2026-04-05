import type { FC } from "react";
import type { PipelineDashboardData } from "../../api";
import { getPromptDisplay } from "./promptDisplay";

type MissionOverviewPanelProps = {
  prompt: PipelineDashboardData["prompts"][number] | undefined;
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

export const MissionOverviewPanel: FC<MissionOverviewPanelProps> = ({ prompt }) => {
  const display = getPromptDisplay(prompt, "Building mission overview...");
  const parsed = splitSummary(display.text);

  return (
    <section className="panel space-panel mission-summary-panel">
      <p className="panel-kicker">Mission Intelligence</p>
      <h2>Mission Summary</h2>
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
      ) : null}
      <div className="panel-footer-row">
        <small className="status-label">Status: {display.statusLabel}</small>
        <small className="subtle">{prompt?.lastRunAt ? `Run: ${prompt.lastRunAt}` : "Awaiting first run"}</small>
      </div>
    </section>
  );
};
