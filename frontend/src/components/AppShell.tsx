import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { displayNameFromEmail, formatAsOf, initialsFromName } from '../lib/format.ts';
import { LogoChip } from './BrandLogo.tsx';
import { DotField } from './DotField.tsx';

export function AppShell() {
  const { user, asOf, logout, refreshAsOf } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    void refreshAsOf();
  }, [location.pathname, refreshAsOf]);

  if (!user) return null;

  const name = user.displayName?.trim() || displayNameFromEmail(user.email);
  const companyLabel = user.companyId ?? 'All companies';
  const asOfLabel = asOf ? `As of ${formatAsOf(asOf)}` : 'No published data';

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <DotField variant="light" />
      <header className="app-header">
        <div className="header-left">
          <LogoChip />
          <span className="header-wordmark">Shankara ERP</span>
          <nav className="header-nav" aria-label="Primary">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Vouchers
            </NavLink>
            <NavLink to="/catalog" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Catalog
            </NavLink>
            {user.role === 'steward' && (
              <>
                <NavLink to="/upload" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  Upload
                </NavLink>
                <NavLink to="/catalog/upload" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  Catalog Upload
                </NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="header-right">
          <span className="pill pill-info">{companyLabel}</span>
          <span className={`as-of${asOf ? '' : ' muted'}`}>{asOfLabel}</span>
          <span className="user-chip" title={user.email}>
            <span className="avatar" aria-hidden="true">{initialsFromName(name)}</span>
            <span className="user-meta">
              <span className="user-name">{name}</span>
              <span className="user-role">{user.role}</span>
            </span>
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => void onLogout()}>
            Logout
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
