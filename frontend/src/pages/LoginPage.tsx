import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { BrandLogo } from '../components/BrandLogo.tsx';
import { isApiError } from '../lib/api.ts';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setError('Invalid credentials');
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
      <div className="login-card">
        <BrandLogo height={46} />
        <p className="login-tagline">Book of record. Search-first.</p>
        <form onSubmit={(e) => void onSubmit(e)} className="login-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
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
