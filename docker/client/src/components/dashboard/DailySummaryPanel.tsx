import type { FC } from "react";
import type { PipelineDashboardData } from "../../api";
import { getPromptDisplay } from "./promptDisplay";

type DailySummaryPanelProps = {
  prompt: PipelineDashboardData["prompts"][number] | undefined;
  latestDay: string | undefined;
};

export const DailySummaryPanel: FC<DailySummaryPanelProps> = ({ prompt, latestDay }) => {
  const display = getPromptDisplay(prompt, "Not ready yet.");

  return (
    <section className="panel space-panel">
      <h2>Last 24 Hours</h2>
      <p>{display.text}</p>
      <small className="status-label">Status: {display.statusLabel}</small>
      <p className="subtle">{latestDay ? `Latest day in cache: ${latestDay}` : "No ingested day yet."}</p>
    </section>
  );
};
