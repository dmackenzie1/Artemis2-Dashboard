import type { FC } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { DailyPage } from "./pages/DailyPage";
import { TimelinePage } from "./pages/TimelinePage";
import { TopicPage } from "./pages/TopicPage";

export const App: FC = () => {
  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Artemis 2 Mission Intelligence</h1>
        <nav>
          <NavLink to="/">Overview</NavLink>
          <NavLink to="/daily">Daily</NavLink>
          <NavLink to="/timeline">Timeline</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/daily" element={<DailyPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/topics/:title" element={<TopicPage />} />
        </Routes>
      </main>
    </div>
  );
};
