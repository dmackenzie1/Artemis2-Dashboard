import type { FunctionComponent } from "react";
import { DailySummaryPanel } from "../components/dashboard/DailySummaryPanel";
import { DashboardToolbar } from "../components/dashboard/DashboardToolbar";
import { MissionChatPanel } from "../components/dashboard/MissionChatPanel";
import { MissionOverviewPanel } from "../components/dashboard/MissionOverviewPanel";
import { StatsPanel } from "../components/dashboard/StatsPanel";
import { useDashboardController } from "./dashboard/useDashboardController";

export const DashboardPage: FunctionComponent = () => {
  const {
    health,
    viewModel,
    chatInput,
    chatMode,
    isThinking,
    chatMessages,
    onChatInputChange,
    onChatModeChange,
    onChatSubmit
  } = useDashboardController();

  return (
    <div className="dashboard-layout">
      <section className="dashboard-main-grid">
        <MissionOverviewPanel
          statusLabel={viewModel.missionSummary.statusLabel}
          summaryText={viewModel.missionSummary.text}
          lastRunAt={viewModel.missionSummary.lastRunAt}
        />
        <DailySummaryPanel
          statusLabel={viewModel.dailySummary.statusLabel}
          summaryText={viewModel.dailySummary.text}
          latestDay={viewModel.latestDay}
        />
      </section>

      <aside className="dashboard-right-rail">
        <DashboardToolbar health={health} />
        <StatsPanel stats={viewModel.stats} />
      </aside>

      <section className="timeline-strip-panel">
        <MissionChatPanel
          chatInput={chatInput}
          chatMode={chatMode}
          isThinking={isThinking}
          chatMessages={chatMessages}
          onChatInputChange={onChatInputChange}
          onChatModeChange={onChatModeChange}
          onChatSubmit={onChatSubmit}
        />
      </section>
    </div>
  );
};
