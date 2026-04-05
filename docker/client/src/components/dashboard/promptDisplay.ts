import type { PipelineDashboardData } from "../../api";

export const getPromptDisplay = (
  prompt: PipelineDashboardData["prompts"][number] | undefined,
  defaultMessage: string
): { text: string; statusLabel: string } => {
  if (!prompt) {
    return { text: defaultMessage, statusLabel: "not ready" };
  }

  if (prompt.status === "success" && prompt.output) {
    return { text: prompt.output, statusLabel: "ready" };
  }

  if (prompt.status === "running") {
    return { text: "Querying...", statusLabel: "querying" };
  }

  if (prompt.status === "failed") {
    return { text: `Not ready. ${prompt.errorMessage ?? "The query failed before returning text."}`.trim(), statusLabel: "failed" };
  }

  return { text: "Building...", statusLabel: "building" };
};
