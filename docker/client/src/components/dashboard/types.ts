export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  strategy?: {
    mode: "rag_chat" | "llm_chat";
    totalUtterances: number;
    contextUtterances: number;
    daysQueried: number;
  };
};
