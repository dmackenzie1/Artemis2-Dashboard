import type { FC } from "react";
import { WindowedDailyPage } from "./WindowedDailyPage";

export const TwelveHourPage: FC = () => (
  <WindowedDailyPage componentKey="twelve-hour-page" navLabel="12 Hour" pageTitle="12 Hour View" windowHours={12} />
);
