import type { FunctionComponent, ReactNode } from "react";
import styles from "../../../styles.shared.module.css";
import { useComponentIdentity } from "./useComponentIdentity";

type DashboardPanelProps = {
  className?: string;
  componentId?: string;
  kicker: string;
  title: string;
  headerAccessory?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export const DashboardPanel: FunctionComponent<DashboardPanelProps> = ({
  className,
  componentId = "dashboard-panel",
  kicker,
  title,
  headerAccessory,
  children,
  footer
}) => {
  const { componentUid } = useComponentIdentity(componentId);

  return (
    <section
      className={`${styles.panel} ${styles["space-panel"]} ${className ?? ""}`.trim()}
      data-component-id={componentId}
      data-component-uid={componentUid}
    >
      <div className={styles["dashboard-panel-header"]}>
        <div>
          <p className={styles["panel-kicker"]}>{kicker}</p>
          <h2>{title}</h2>
        </div>
        {headerAccessory}
      </div>
      <div className={styles["panel-body"]}>{children}</div>
      {footer ? <div className={styles["panel-footer-row"]}>{footer}</div> : null}
    </section>
  );
};
