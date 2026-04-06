import type { FC } from "react";
import { WindowedDailyPage } from "./WindowedDailyPage";

export const SixHourPage: FC = () => (
  <WindowedDailyPage componentKey="six-hour-page" pageTitle="6 Hour View" windowHours={6} />
);
