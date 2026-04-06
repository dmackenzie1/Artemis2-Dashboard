import type { FunctionComponent } from "react";
import sharedStyles from "../../../styles/shared.module.css";
import styles from "./PaneStateMessage.module.css";
import { LoadingIndicator } from "./LoadingIndicator";
import { useComponentIdentity } from "./useComponentIdentity";

type PaneStateMessageProps = {
  message: string;
  tone?: "empty" | "loading" | "error";
};

export const PaneStateMessage: FunctionComponent<PaneStateMessageProps> = ({ message, tone = "empty" }) => {
  const { componentId, componentUid } = useComponentIdentity("pane-state-message");

  if (tone === "loading") {
    return <LoadingIndicator message={message} />;
  }

  return (
    <p
      className={`${sharedStyles.subtle} ${styles["pane-state-message"]} ${styles[`pane-state-${tone}`] ?? ""}`}
      data-component-id={componentId}
      data-component-uid={componentUid}
    >
      {message}
    </p>
  );
};
