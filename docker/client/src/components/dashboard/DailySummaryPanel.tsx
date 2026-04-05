import type { FC } from "react";
import type { PipelineDashboardData } from "../../api";
import { getPromptDisplay } from "./promptDisplay";

type DailySummaryPanelProps = {
  prompt: PipelineDashboardData["prompts"][number] | undefined;
  latestDay: string | undefined;
};

const summarizeLines = (text: string): string[] => {
  return text
    .split(/\n+/u)
    .map((line) => line.replace(/^[-•*]\s*/u, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);
};

export const DailySummaryPanel: FC<DailySummaryPanelProps> = ({ prompt, latestDay }) => {
  const display = getPromptDisplay(prompt, "Not ready yet.");
  const rows = summarizeLines(display.text);

  return (
    <section className="panel space-panel daily-summary-panel">
      <p className="panel-kicker">Operational Readout</p>
      <h2>Last 24 Hours</h2>
      <div className="summary-feed" role="list">
        {rows.map((row, index) => (
          <p key={`${row}-${index}`} role="listitem" className="summary-row">
            {row}
          </p>
        ))}
      </div>
      <div className="panel-footer-row">
        <small className="status-label">Status: {display.statusLabel}</small>
        <small className="subtle">{latestDay ? `Latest ingested day: ${latestDay}` : "No ingested day yet"}</small>
      </div>
      {display.preview ? (
        <p className="subtle">Preview: {display.preview}</p>
      ) : null}
    </section>
  );
};
