import type { FC } from "react";
import { WindowedDailyPage } from "./WindowedDailyPage";

export const SixHourPage: FC = () => (
  <WindowedDailyPage componentKey="six-hour-page" navLabel="6 Hour" pageTitle="6 Hour View" windowHours={6} />
);
