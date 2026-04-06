import type { PipelineDashboardData } from "../../api";

export const getPromptDisplay = (
  prompt: PipelineDashboardData["prompts"][number] | undefined,
  defaultMessage: string
): { text: string; statusLabel: string; preview: string | null } => {
  if (!prompt) {
    return { text: defaultMessage, statusLabel: "not ready", preview: null };
  }

  if (prompt.status === "success") {
    const output = prompt.output?.trim().length ? prompt.output : "LLM returned an empty response.";
    return {
      text: output,
      statusLabel: prompt.cacheHit ? "ready (cached)" : "ready",
      preview: prompt.outputPreview
    };
  }

  if (prompt.status === "running") {
    return {
      text: "Waiting for results...",
      statusLabel: "querying",
      preview: prompt.submittedPreview
    };
  }

  if (prompt.status === "failed") {
    return {
      text: `Not ready. ${prompt.errorMessage ?? "The query failed before returning text."}`.trim(),
      statusLabel: "failed",
      preview: prompt.submittedPreview
    };
  }

  return { text: "Waiting for results...", statusLabel: "building", preview: prompt.submittedPreview };
};
