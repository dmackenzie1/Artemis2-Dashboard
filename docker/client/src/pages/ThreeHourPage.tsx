import type { FC } from "react";
import { WindowedDailyPage } from "./WindowedDailyPage";

export const ThreeHourPage: FC = () => (
  <WindowedDailyPage componentKey="three-hour-page" navLabel="3 Hour" pageTitle="3 Hour View" windowHours={3} />
);
