import { NavLink, Route, Routes, Link } from 'react-router';
import { ProbeBar } from './components/ProbeBar.jsx';
import { AssetForm } from './pages/AssetForm.jsx';
import { CompliancePage } from './pages/CompliancePage.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { DevicesPage } from './pages/DevicesPage.jsx';
import { SitePage } from './pages/SitePage.jsx';
import { TaskRunPage } from './pages/TaskRunPage.jsx';
import { TasksPage } from './pages/TasksPage.jsx';

export function App() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            Legionella Dossier
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              Sites
            </NavLink>
            <NavLink to="/tasks">Tasks</NavLink>
            <NavLink to="/devices">Probe</NavLink>
          </nav>
          <ProbeBar />
        </div>
      </header>
      <main className="app">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites/:siteId" element={<SitePage />} />
          <Route path="/sites/:siteId/assets/new" element={<AssetForm />} />
          <Route path="/sites/:siteId/report" element={<CompliancePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskRunPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
