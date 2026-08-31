import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, isApiError } from '../lib/api.ts';

export function AccountPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNote('');
    if (newPassword !== confirm) {
      setError('The two new-password fields do not match.');
      return;
    }
    setSaving(true);
    try {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      setNote('Password updated. You are still signed in.');
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setError('That current password is not right.');
      } else {
        setError(isApiError(err) ? err.message : 'Could not change password');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="upload-page">
      <h1 className="page-title">Your password</h1>
      <p className="muted page-lead">
        Anyone signed in can change their own password here. If you forget it,
        ask an office admin to set a new one under People.
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}
      {note && <p className="upload-note">{note}</p>}

      <form className="upload-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>New password (at least 8 characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className="field">
          <span>New password again</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
