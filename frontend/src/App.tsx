import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth.ts';
import { AppShell } from './components/AppShell.tsx';
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

export default function App() {
  const { loading } = useAuth();
  if (loading) {
    return <div className="boot">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<SearchPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/upload" element={<CatalogUploadPage />} />
          <Route path="/upload" element={<UploadPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
