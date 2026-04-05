import type { FunctionComponent } from "react";
import { LoadingIndicator } from "./LoadingIndicator";

type PaneStateMessageProps = {
  message: string;
  tone?: "empty" | "loading" | "error";
};

export const PaneStateMessage: FunctionComponent<PaneStateMessageProps> = ({ message, tone = "empty" }) => {
  if (tone === "loading") {
    return <LoadingIndicator message={message} />;
  }

  return <p className={`subtle pane-state-message pane-state-${tone}`}>{message}</p>;
};
