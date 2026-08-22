import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { isApiError } from '../lib/api.ts';
import { DotField } from '../components/DotField.tsx';

// Only ever trust `next` as an in-app path — a bare "/..." that isn't
// protocol-relative ("//evil.com" is a path by that same rule, so guard
// against it explicitly). Never navigate to whatever a URL query param
// says verbatim; that's an open-redirect waiting to happen.
function safeNextPath(raw: string | null): string {
  if (!raw) return '/';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={nextPath} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(nextPath, { replace: true });
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setError('That email or password is not right.');
      } else if (isApiError(err) && err.status === 429) {
        setError('Too many attempts, wait a moment.');
      } else if (isApiError(err)) {
        setError(err.message);
      } else {
        setError('Sign in failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <DotField variant="dark" />
      <div className="login-card">
        <BrandLogo height={46} />
        <p className="login-tagline">Find a bill. Find an item.</p>
        <form onSubmit={(e) => void onSubmit(e)} className="login-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <p className="login-foot">No self-serve signup — contact your steward for access.</p>
      </div>
    </div>
  );
}
