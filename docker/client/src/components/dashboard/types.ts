import type { ChatMode } from "../../api";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  strategy?: {
    mode: ChatMode;
    totalUtterances: number;
    contextUtterances: number;
    wasTruncated: boolean;
  };
};
