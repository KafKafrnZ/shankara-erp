import { useState } from 'react';
import { api, isApiError } from '../lib/api.ts';
import { buildExcelPasteText, exportToExcel } from '../lib/excel-export.ts';
import type { ExportableRow } from '../lib/excel-export.ts';

export type SelectedItem = { code: string; name: string };

type Props = {
  items: SelectedItem[];
  onRemove: (code: string) => void;
  onClear: () => void;
};

// A sticky bar, not a modal — staying visible while the search behind it
// keeps working is the whole point: search, check a few boxes, search
// again, check a few more, then act on everything at once.
export function SelectionTray({ items, onRemove, onClear }: Props) {
  const [busy, setBusy] = useState<'copy' | 'export' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);

  if (items.length === 0) return null;

  const codes = items.map((i) => i.code);

  const onCopy = async () => {
    setBusy('copy');
    setError('');
    try {
      const rows = await api<ExportableRow[]>('/api/item-search/bulk', {
        method: 'POST',
        body: JSON.stringify({ itemCodes: codes }),
      });
      await navigator.clipboard.writeText(buildExcelPasteText(rows));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Couldn't copy — try again.");
    } finally {
      setBusy(null);
    }
  };

  const onExport = async () => {
    setBusy('export');
    setError('');
    try {
      await exportToExcel(codes, `catalog-export-${codes.length}-items.xlsx`);
    } catch {
      setError("Couldn't export — try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="selection-tray-wrap">
      {reviewing && (
        <div className="selection-review" role="region" aria-label="Review selected items">
          <ul className="selection-review-list">
            {items.map((item) => (
              <li key={item.code}>
                <span className="selection-review-name">{item.name}</span>
                <span className="selection-review-code">{item.code}</span>
                <button
                  type="button"
                  className="filter-bar-remove"
                  aria-label={`Remove ${item.name} from selection`}
                  onClick={() => onRemove(item.code)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="selection-tray" role="region" aria-label="Selected items">
        <button
          type="button"
          className="selection-tray-count"
          onClick={() => setReviewing((r) => !r)}
          aria-expanded={reviewing}
        >
          {items.length === 1 ? '1 item selected' : `${items.length} items selected`}
          <span className="selection-tray-toggle" aria-hidden="true">{reviewing ? 'Hide ▲' : 'Show ▾'}</span>
        </button>
        {error && <span className="selection-tray-error" role="alert">{error}</span>}
        <div className="selection-tray-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void onCopy()} disabled={busy !== null}>
            {busy === 'copy' ? 'Copying…' : copied ? 'Copied' : 'Copy details'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void onExport()} disabled={busy !== null}>
            {busy === 'export' ? 'Exporting…' : 'Export to Excel'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClear} disabled={busy !== null}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
