import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth.ts';
import { AppShell } from './components/AppShell.tsx';
import { ChooserPage } from './pages/ChooserPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { CatalogPage } from './pages/CatalogPage.tsx';
import { CatalogUploadPage } from './pages/CatalogUploadPage.tsx';

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="boot">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// The root path is the one place an unauthenticated visitor doesn't go
// straight to /login: they see the split chooser first (pick Vouchers or
// Catalog), which itself sends them to /login?next=... Any other protected
// route hit directly while unauthenticated (a deep link, a bookmark) still
// goes straight to /login via RequireAuth above — the chooser is the cold
// start experience, not a detour on every route.
function RootGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="boot">Loading…</div>;
  }
  if (!user) {
    return <ChooserPage />;
  }
  return <Outlet />;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) {
    return <div className="boot">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RootGate />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<SearchPage />} />
        </Route>
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/upload" element={<CatalogUploadPage />} />
          <Route path="/upload" element={<UploadPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
