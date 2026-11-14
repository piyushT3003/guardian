import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, ToastProvider, useAuth } from './lib/auth.jsx';
import Layout, { NAV } from './components/Layout.jsx';
import { PageLoading, ToastStack } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Backdrop from './components/Backdrop.jsx';

const Overview = lazy(() => import('./pages/Overview.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Intelligence = lazy(() => import('./pages/Intelligence.jsx'));
const Investigations = lazy(() => import('./pages/Investigations.jsx'));
const Geo = lazy(() => import('./pages/Geo.jsx'));
const Approvals = lazy(() => import('./pages/Approvals.jsx'));
const Recovery = lazy(() => import('./pages/Recovery.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
const Timeline = lazy(() => import('./pages/Timeline.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Health = lazy(() => import('./pages/Health.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const Demo = lazy(() => import('./pages/Demo.jsx'));

function Guard({ children, path }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div style={{ padding: 40 }}><PageLoading /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  const meta = NAV.find((n) => n.to === path);
  if (meta && !meta.roles.includes(user.role)) return <Navigate to={user.role === 'family' ? '/approvals' : '/overview'} replace />;
  if (path === '/demo' && user.role === 'family') return <Navigate to="/approvals" replace />;
  return children;
}
const page = (path, El) => <Guard path={path}><Suspense fallback={<PageLoading />}><El /></Suspense></Guard>;

// Re-mount the shell when the signed-in user changes so every role-scoped query refetches.
function UserShell() { const { user } = useAuth(); return <Layout key={user?.id} />; }

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={!user ? '/login' : user.role === 'family' ? '/approvals' : '/overview'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider render={(items) => <ToastStack items={items} />}>
        <Backdrop />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guard><UserShell /></Guard>}>
            <Route path="/overview" element={page('/overview', Overview)} />
            <Route path="/transactions" element={page('/transactions', Transactions)} />
            <Route path="/transactions/:id" element={page('/transactions', Transactions)} />
            <Route path="/intelligence" element={page('/intelligence', Intelligence)} />
            <Route path="/intelligence/:id" element={page('/intelligence', Intelligence)} />
            <Route path="/investigations" element={page('/investigations', Investigations)} />
            <Route path="/investigations/:id" element={page('/investigations', Investigations)} />
            <Route path="/geo" element={page('/geo', Geo)} />
            <Route path="/approvals" element={page('/approvals', Approvals)} />
            <Route path="/approvals/:id" element={page('/approvals', Approvals)} />
            <Route path="/recovery" element={page('/recovery', Recovery)} />
            <Route path="/recovery/:id" element={page('/recovery', Recovery)} />
            <Route path="/customers" element={page('/customers', Customers)} />
            <Route path="/customers/:id" element={page('/customers', Customers)} />
            <Route path="/analytics" element={page('/analytics', Analytics)} />
            <Route path="/timeline" element={page('/timeline', Timeline)} />
            <Route path="/notifications" element={page('/notifications', Notifications)} />
            <Route path="/audit" element={page('/audit', Audit)} />
            <Route path="/health" element={page('/health', Health)} />
            <Route path="/reports" element={page('/reports', Reports)} />
            <Route path="/settings" element={page('/settings', SettingsPage)} />
            <Route path="/demo" element={page('/demo', Demo)} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
