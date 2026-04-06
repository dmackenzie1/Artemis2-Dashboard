export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  strategy?: {
    mode: "multi-day" | "rag" | "all";
    totalUtterances: number;
    contextUtterances: number;
    daysQueried: number;
  };
};
