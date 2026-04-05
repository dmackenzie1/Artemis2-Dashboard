import type { FunctionComponent } from "react";

type PaneStateMessageProps = {
  message: string;
};

export const PaneStateMessage: FunctionComponent<PaneStateMessageProps> = ({ message }) => {
  return <p className="subtle pane-state-message">{message}</p>;
};
