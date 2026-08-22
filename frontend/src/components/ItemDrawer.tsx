import { useEffect, useState } from 'react';
import { api, isApiError } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import { itemPrimaryKey } from '../lib/item-key.ts';

type Props = {
  itemCode: string;
  onClose: () => void;
};

interface ItemHistoryRow {
  id: string;
  itemCode: string;
  catalogueNo: string | null;
  sapItemCode: string | null;
  brand: string | null;
  itemName: string;
  hsnDescription: string | null;
  mainGroup: string | null;
  subGroup: string | null;
  uom: string | null;
  alias: string | null;
  layoutKey: string | null;
  validFrom: string;
  validTo: string | null;
}

export function ItemDrawer({ itemCode, onClose }: Props) {
  const [history, setHistory] = useState<ItemHistoryRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyText, setCopyText] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setError('');
    setLoading(true);
    (async () => {
      try {
        const data = await api<ItemHistoryRow[]>(`/api/item-search/history/${encodeURIComponent(itemCode)}`);
        if (!cancelled) {
          setHistory(data);
        }
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && (err.status === 404 || err.status === 403)) {
          setError('Item not found');
        } else if (isApiError(err)) {
          setError(err.message);
        } else {
          setError('Failed to load item');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemCode]);

  const current = history[0];
  const key = current ? itemPrimaryKey(current) : null;

  // Copies every field shown on screen, not just the item code — the code
  // alone (which for master-code-layout rows literally IS the alias) isn't
  // what someone pastes into a WhatsApp message to a supplier or into an
  // Excel sheet; they want the whole item, the way it looks on the drawer.
  const copyDetails = async () => {
    if (!current) return;
    const keyLine = itemPrimaryKey(current);
    const lines = [
      `${keyLine.label}: ${keyLine.value}`,
      current.itemName,
      current.brand && `Brand: ${current.brand}`,
      current.catalogueNo && keyLine.kind !== 'catalogueNo' && `Catalogue No: ${current.catalogueNo}`,
      current.sapItemCode && keyLine.kind !== 'sapItemCode' && `SAP Item Code: ${current.sapItemCode}`,
      current.alias && keyLine.kind !== 'alias' && `Alias: ${current.alias}`,
      current.mainGroup && `Main Group: ${current.mainGroup}`,
      current.subGroup && `Sub Group: ${current.subGroup}`,
      current.uom && `UOM: ${current.uom}`,
      current.hsnDescription && `HSN Description: ${current.hsnDescription}`,
    ].filter(Boolean) as string[];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyText('');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyText(text);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Item detail">
        <div className="drawer-head">
          <div>
            {current ? (
              <>
                <div className="drawer-kicker">{current.brand || 'No brand'}</div>
                <h2 className="drawer-title">{current.itemName}</h2>
                <p className="drawer-sub"><span className="key-kicker">{key?.label}</span> {current.itemCode}</p>
              </>
            ) : (
              <h2 className="drawer-title">Item Master</h2>
            )}
          </div>
          <div className="drawer-actions">
            {current && (
              <button type="button" className="btn btn-ghost" onClick={() => void copyDetails()}>
                {copied ? 'Copied' : 'Copy details'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="drawer-body">
        {error && <p className="empty-copy">{error}</p>}
        {loading && !error && <p className="muted">Loading…</p>}
        {/* The API returns [] (not a 404) for an unknown code, so without
            this the drawer opened completely blank — no data, no message. */}
        {!loading && !error && !current && (
          <p className="empty-copy">
            No details found for this item. It may have been removed from the catalog since this
            list was loaded — try searching for it again.
          </p>
        )}

        {!loading && !error && current && (
          <>
            <dl className="meta-grid">
              <div className={key?.kind === 'catalogueNo' ? 'meta-key' : undefined}>
                <dt>Catalogue No</dt>
                <dd>{current.catalogueNo || '—'}</dd>
              </div>
              <div className={key?.kind === 'sapItemCode' ? 'meta-key' : undefined}>
                <dt>SAP Item Code</dt>
                <dd>{current.sapItemCode || '—'}</dd>
              </div>
              <div>
                <dt>Main Group</dt>
                <dd>{current.mainGroup || '—'}</dd>
              </div>
              <div>
                <dt>Sub Group</dt>
                <dd>{current.subGroup || '—'}</dd>
              </div>
              <div>
                <dt>UOM</dt>
                <dd>{current.uom || '—'}</dd>
              </div>
              <div className={key?.kind === 'alias' ? 'meta-key' : undefined}>
                <dt>Alias</dt>
                <dd>{current.alias || '—'}</dd>
              </div>
              {current.hsnDescription && (
                <div className="meta-span">
                  <dt>HSN Description</dt>
                  <dd>{current.hsnDescription}</dd>
                </div>
              )}
            </dl>

            {copyText && (
              <label className="field" style={{ marginBottom: '16px' }}>
                <span>Clipboard blocked — select and copy this</span>
                <textarea readOnly rows={6} value={copyText} />
              </label>
            )}

            <h3 style={{ fontSize: '13px', marginTop: '24px', marginBottom: '8px' }}>Version History</h3>
            <table className="lines-table">
              <thead>
                <tr>
                  <th>Valid From</th>
                  <th>Valid To</th>
                  <th>Name / Brand</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.validFrom)}</td>
                    <td>{row.validTo ? formatDate(row.validTo) : 'Current'}</td>
                    <td>
                      <div>{row.itemName}</div>
                      <div className="muted">{row.brand}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        </div>
      </aside>
    </>
  );
}
