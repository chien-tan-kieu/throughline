import { HashRouter, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { Topbar } from "./components/layout/Topbar.tsx";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { PlanPage } from "./pages/PlanPage.tsx";
import { SpecPage } from "./pages/SpecPage.tsx";
import { StandupPage } from "./pages/StandupPage.tsx";
import { StoriesPage } from "./pages/StoriesPage.tsx";
import { StoryPage } from "./pages/StoryPage.tsx";

function Shell() {
  useWebSocket();
  return (
    <div className="app">
      <Topbar />
      <div className="app-body">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<PlanPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/story/:id" element={<StoryPage />} />
            <Route path="/spec" element={<SpecPage />} />
            <Route path="/standup" element={<StandupPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
