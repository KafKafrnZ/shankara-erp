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
      <p className="banner-title">Where should these items go?</p>
      <p className="muted">
        A new sheet becomes its own live search file. Adding to an existing sheet
        puts the items into that file.
      </p>

      <fieldset className="sheet-dest-choices" disabled={busy}>
        <label className="sheet-dest-choice">
          <input
            type="radio"
            name="sheet-dest"
            checked={mode === 'new'}
            onChange={() => setMode('new')}
          />
          <span>Create a new sheet</span>
        </label>
        <label className={`sheet-dest-choice${noLive ? ' is-disabled' : ''}`}>
          <input
            type="radio"
            name="sheet-dest"
            checked={mode === 'existing'}
            onChange={() => setMode('existing')}
            disabled={!!noLive}
          />
          <span>Add to an existing live sheet</span>
        </label>
      </fieldset>

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

      {noLive && mode === 'existing' && (
        <p className="muted">No live sheet yet — create a new one instead.</p>
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
