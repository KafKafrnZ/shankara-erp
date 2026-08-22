import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { displayNameFromEmail, formatAsOf, initialsFromName } from '../lib/format.ts';
import { readHowToDismissed, writeHowToDismissed } from '../lib/howto.ts';
import { LogoChip } from './BrandLogo.tsx';
import { DotField } from './DotField.tsx';
import { HowToOverlay } from './HowToOverlay.tsx';

// Icon travels with the word everywhere — someone learning this system by
// watching, not reading, recognizes the shape of "Search" and "Upload"
// faster than the word itself, and the pair together works for people who
// read English less confidently than they'd say out loud.
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11L15 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 11V2M8 2L4.5 5.5M8 2L11.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 12v1.5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell() {
  const { user, asOf, logout, refreshAsOf } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [howtoOpen, setHowtoOpen] = useState(() => !readHowToDismissed());

  useEffect(() => {
    void refreshAsOf();
  }, [location.pathname, refreshAsOf]);

  const dismissHowto = () => {
    writeHowToDismissed();
    setHowtoOpen(false);
  };

  if (!user) return null;

  const name = user.displayName?.trim() || displayNameFromEmail(user.email);
  const companyLabel = user.companyId ?? 'All companies';
  const asOfLabel = asOf ? `As of ${formatAsOf(asOf)}` : 'No live data yet';
  const roleLabel =
    user.role === 'steward' ? 'Office admin' : user.role === 'finance' ? 'Accounts' : user.role === 'branch' ? 'Branch' : user.role;

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
            <div className="nav-group">
              <span className="nav-group-label">Day book</span>
              <div className="nav-group-links">
                <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link nav-link-vouchers active' : 'nav-link nav-link-vouchers')}>
                  <SearchIcon /> Find bill
                </NavLink>
                {user.role === 'steward' && (
                  <NavLink to="/upload" className={({ isActive }) => (isActive ? 'nav-link nav-link-vouchers active' : 'nav-link nav-link-vouchers')}>
                    <UploadIcon /> Upload day book
                  </NavLink>
                )}
              </div>
            </div>
            <div className="nav-divider" aria-hidden="true" />
            <div className="nav-group">
              <span className="nav-group-label">Items</span>
              <div className="nav-group-links">
                <NavLink to="/catalog" end className={({ isActive }) => (isActive ? 'nav-link nav-link-catalog active' : 'nav-link nav-link-catalog')}>
                  <SearchIcon /> Find item
                </NavLink>
                {user.role === 'steward' && (
                  <NavLink to="/catalog/upload" className={({ isActive }) => (isActive ? 'nav-link nav-link-catalog active' : 'nav-link nav-link-catalog')}>
                    <UploadIcon /> Upload items
                  </NavLink>
                )}
              </div>
            </div>
          </nav>
        </div>
        <div className="header-right">
          <button type="button" className="btn btn-ghost" onClick={() => setHowtoOpen(true)}>
            How to use
          </button>
          {user.role === 'steward' && (
            <NavLink to="/admin/users" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              People
            </NavLink>
          )}
          <span className="pill pill-info">{companyLabel}</span>
          <span className={`as-of${asOf ? '' : ' muted'}`}>{asOfLabel}</span>
          <span className="user-chip" title={user.email}>
            <span className="avatar" aria-hidden="true">{initialsFromName(name)}</span>
            <span className="user-meta">
              <span className="user-name">{name}</span>
              <span className="user-role">{roleLabel}</span>
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
      <HowToOverlay open={howtoOpen} onClose={dismissHowto} />
    </div>
  );
}
