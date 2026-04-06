export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  strategy?: {
    mode: "multi-day";
    totalUtterances: number;
    contextUtterances: number;
    daysQueried: number;
  };
};
