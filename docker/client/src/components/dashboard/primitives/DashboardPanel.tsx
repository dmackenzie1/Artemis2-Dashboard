import type { FunctionComponent, ReactNode } from "react";

type DashboardPanelProps = {
  className?: string;
  kicker: string;
  title: string;
  headerAccessory?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export const DashboardPanel: FunctionComponent<DashboardPanelProps> = ({
  className,
  kicker,
  title,
  headerAccessory,
  children,
  footer
}) => {
  return (
    <section className={`panel space-panel ${className ?? ""}`.trim()}>
      <div className="dashboard-panel-header">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
        {headerAccessory}
      </div>
      {children}
      {footer ? <div className="panel-footer-row">{footer}</div> : null}
    </section>
  );
};
