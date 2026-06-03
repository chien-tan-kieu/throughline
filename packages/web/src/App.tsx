import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { Topbar } from "./components/layout/Topbar.tsx";
import { useWebSocket } from "./hooks/useWebSocket.ts";
import { DocsPage } from "./pages/DocsPage.tsx";
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
            <Route path="/" element={<Navigate to="/docs" replace />} />
            <Route path="/plan" element={<Navigate to="/docs" replace />} />
            <Route path="/spec" element={<Navigate to="/docs?tab=spec" replace />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/story/:id" element={<StoryPage />} />
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
