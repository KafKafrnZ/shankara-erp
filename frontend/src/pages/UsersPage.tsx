import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { api, isApiError } from '../lib/api.ts';
import type { Role } from '../lib/types.ts';

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  companyId: string | null;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
};

const ROLE_LABEL: Record<Role, string> = {
  steward: 'Office admin',
  finance: 'Accounts',
  branch: 'Branch',
};

function emptyForm() {
  return {
    email: '',
    displayName: '',
    role: 'finance' as Role,
    companyId: '',
    branchId: '',
    password: '',
  };
}

export function UsersPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = async () => {
    const rows = await api<AdminUser[]>('/api/users');
    setPeople(rows);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(isApiError(err) ? err.message : 'Could not load people');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;
  if (user.role !== 'steward') {
    return (
      <div className="empty-state">
        <h1>You don't have access to this</h1>
        <p className="empty-copy">Only an office admin can add or turn off people.</p>
        <Link to="/" className="btn btn-secondary">Back to search</Link>
      </div>
    );
  }

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNote('');
    try {
      await api<AdminUser>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          role: form.role,
          companyId: form.companyId.trim() || undefined,
          branchId: form.branchId.trim() || undefined,
          password: form.password,
        }),
      });
      setForm(emptyForm());
      setNote('Person added. They can sign in with that email and password.');
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not add this person');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (person: AdminUser, isActive: boolean) => {
    setError('');
    setNote('');
    try {
      await api<AdminUser>(`/api/users/${person.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      setNote(isActive ? `${person.displayName} can sign in again.` : `${person.displayName} can no longer sign in.`);
      await load();
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not update this person');
    }
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    setSaving(true);
    setError('');
    setNote('');
    try {
      await api<AdminUser>(`/api/users/${resetFor}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      setNote('Password changed. They must sign in with the new one.');
      setResetFor(null);
      setNewPassword('');
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Could not set a new password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="upload-page">
      <h1 className="page-title">People who can sign in</h1>
      <p className="muted page-lead">Add someone, turn their access off, or set a new password. There is no self-signup.</p>

      {error && <p className="form-error" role="alert">{error}</p>}
      {note && <p className="upload-note">{note}</p>}

      <form className="upload-form" onSubmit={(e) => void onCreate(e)}>
        <label className="field">
          <span>Name</span>
          <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label className="field">
          <span>Job</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="steward">Office admin</option>
            <option value="finance">Accounts</option>
            <option value="branch">Branch</option>
          </select>
        </label>
        <label className="field">
          <span>Company (optional)</span>
          <input value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} />
        </label>
        <label className="field">
          <span>Branch (optional)</span>
          <input value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} />
        </label>
        <label className="field">
          <span>Password (at least 8 characters)</span>
          <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add this person'}
        </button>
      </form>

      {resetFor && (
        <form className="upload-form" onSubmit={(e) => void onReset(e)}>
          <p className="muted">Set a new password for {people.find((p) => p.id === resetFor)?.displayName}.</p>
          <label className="field">
            <span>New password (at least 8 characters)</span>
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </label>
          <div className="batch-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>Save password</button>
            <button type="button" className="btn btn-secondary" onClick={() => { setResetFor(null); setNewPassword(''); }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="results-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Job</th>
              <th>Company</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.displayName}</td>
                <td className="nowrap">{person.email}</td>
                <td>{ROLE_LABEL[person.role]}</td>
                <td>{person.companyId || '—'}</td>
                <td>
                  {person.isActive
                    ? <span className="pill pill-success">Can sign in</span>
                    : <span className="pill pill-critical">Turned off</span>}
                </td>
                <td className="row-actions">
                  {person.isActive ? (
                    <button type="button" className="btn btn-ghost" onClick={() => void setActive(person, false)}>Turn off</button>
                  ) : (
                    <button type="button" className="btn btn-ghost" onClick={() => void setActive(person, true)}>Turn on</button>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => { setResetFor(person.id); setNewPassword(''); }}>New password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
