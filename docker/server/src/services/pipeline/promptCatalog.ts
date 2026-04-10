export const promptKeyAliases: Record<string, string> = {
  option_b_db_candidate_retrieval_prompt: "candidate_retrieval",
  query_console_day_extract: "search_day_extract",
  query_console_aggregate: "search_aggregate",
  time_window_summary: "rolling_window_summary",
  top_topics: "topic_overview",
  topic_page: "topic_detail"
};

export const canonicalPromptKey = (rawKey: string): string => {
  return promptKeyAliases[rawKey] ?? rawKey;
};

export const runnablePromptKeys = new Set([
  "daily_summary_am",
  "daily_summary_pm",
  "daily_summary",
  "notable_moments",
  "mission_summary",
  "recent_changes"
]);

export const promptExecutionPriority = [
  "daily_summary_am",
  "daily_summary_pm",
  "daily_summary",
  "notable_moments",
  "recent_changes",
  "mission_summary"
];
