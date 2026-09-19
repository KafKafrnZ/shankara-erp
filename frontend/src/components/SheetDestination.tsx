import { useEffect, useState } from 'react';
import { fetchLiveSources } from '../lib/api.ts';
import type { LiveSourceFile } from '../lib/types.ts';

export type SheetPick =
  | { destination: 'new'; sheetName: string }
  | { destination: 'existing'; targetBatchId: number };

type Props = {
  defaultNewName?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (pick: SheetPick) => void;
  onCancel: () => void;
};

export function SheetDestination({
  defaultNewName = '',
  confirmLabel = 'Add items',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [sheetName, setSheetName] = useState(defaultNewName);
  const [targetId, setTargetId] = useState<number | ''>('');
  const [live, setLive] = useState<LiveSourceFile[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchLiveSources()
      .then((res) => {
        if (cancelled) return;
        setLive(res.items.live);
      })
      .catch(() => {
        if (!cancelled) setLive([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    setError('');
    if (mode === 'new') {
      const name = sheetName.trim();
      if (!name) {
        setError('Give the new sheet a name');
        return;
      }
      onConfirm({ destination: 'new', sheetName: name });
      return;
    }
    if (targetId === '') {
      setError('Pick a live sheet to add these items to');
      return;
    }
    onConfirm({ destination: 'existing', targetBatchId: Number(targetId) });
  };

  const noLive = live && live.length === 0;

  return (
    <form className="sheet-dest" onSubmit={onSubmit}>
      <p className="sheet-dest-kicker">Step 2 of 2</p>
      <h2 className="sheet-dest-title">Where should these items go?</h2>
      <p className="muted">
        Nothing is searchable until you pick. A new sheet is its own live file.
        An existing sheet keeps one list.
      </p>

      <div className="sheet-dest-cards">
        <button
          type="button"
          className={`sheet-dest-card${mode === 'new' ? ' is-on' : ''}`}
          disabled={busy}
          onClick={() => setMode('new')}
        >
          <strong>New sheet</strong>
          <span>Its own live search file. You name it.</span>
        </button>
        <button
          type="button"
          className={`sheet-dest-card${mode === 'existing' ? ' is-on' : ''}`}
          disabled={busy || !!noLive}
          onClick={() => setMode('existing')}
        >
          <strong>Existing sheet</strong>
          <span>
            {noLive
              ? 'No live sheet yet — create a new one.'
              : 'Add these rows into a file that is already live.'}
          </span>
        </button>
      </div>

      {mode === 'new' && (
        <label className="field">
          <span>Sheet name</span>
          <input
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            placeholder="e.g. CP Sani April 2026"
            maxLength={200}
            disabled={busy}
          />
        </label>
      )}

      {mode === 'existing' && (
        <label className="field">
          <span>Live sheet</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value ? Number(e.target.value) : '')}
            disabled={busy || !live}
          >
            <option value="">{live ? 'Select a sheet' : 'Loading…'}</option>
            {(live || []).map((file) => (
              <option key={file.batchId} value={file.batchId}>
                {file.originalName.trim() || `File ${file.batchId}`}
                {` (${file.liveRows.toLocaleString('en-IN')} items)`}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="batch-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
