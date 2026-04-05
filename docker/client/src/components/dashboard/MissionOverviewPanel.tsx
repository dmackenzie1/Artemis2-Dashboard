import type { FC } from "react";
import type { PipelineDashboardData } from "../../api";
import { getPromptDisplay } from "./promptDisplay";

type MissionOverviewPanelProps = {
  prompt: PipelineDashboardData["prompts"][number] | undefined;
};

export const MissionOverviewPanel: FC<MissionOverviewPanelProps> = ({ prompt }) => {
  const display = getPromptDisplay(prompt, "Building mission overview...");

  return (
    <section className="panel space-panel">
      <h2>Mission Overview</h2>
      <p>{display.text}</p>
      <small className="status-label">Status: {display.statusLabel}</small>
      <p className="subtle">{prompt?.lastRunAt ? `Last prompt run: ${prompt.lastRunAt}` : "Waiting for first prompt run."}</p>
    </section>
  );
};
