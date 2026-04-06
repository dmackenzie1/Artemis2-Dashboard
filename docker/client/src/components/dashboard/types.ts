export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  strategy?: {
    mode: "rag" | "all";
    totalUtterances: number;
    contextUtterances: number;
    daysQueried: number;
  };
};
