import { useEffect, useState } from 'react';
import { api, isApiError } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';

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
  validFrom: string;
  validTo: string | null;
}

export function ItemDrawer({ itemCode, onClose }: Props) {
  const [history, setHistory] = useState<ItemHistoryRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const copyNo = async () => {
    try {
      await navigator.clipboard.writeText(itemCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const current = history[0];

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
                <p className="drawer-sub">{current.itemCode}</p>
              </>
            ) : (
              <h2 className="drawer-title">Item Master</h2>
            )}
          </div>
          <div className="drawer-actions">
            {current && (
              <button type="button" className="btn btn-ghost" onClick={() => void copyNo()}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {error && <p className="empty-copy">{error}</p>}
        {loading && !error && <p className="muted">Loading…</p>}

        {!loading && !error && current && (
          <div className="drawer-body">
            <dl className="meta-grid">
              <div>
                <dt>Catalogue No</dt>
                <dd>{current.catalogueNo || '-'}</dd>
              </div>
              <div>
                <dt>SAP Item Code</dt>
                <dd>{current.sapItemCode || '-'}</dd>
              </div>
              <div>
                <dt>Main Group</dt>
                <dd>{current.mainGroup || '-'}</dd>
              </div>
              <div>
                <dt>Sub Group</dt>
                <dd>{current.subGroup || '-'}</dd>
              </div>
              <div>
                <dt>UOM</dt>
                <dd>{current.uom || '-'}</dd>
              </div>
              <div>
                <dt>Alias</dt>
                <dd>{current.alias || '-'}</dd>
              </div>
              {current.hsnDescription && (
                <div className="meta-span">
                  <dt>HSN Description</dt>
                  <dd>{current.hsnDescription}</dd>
                </div>
              )}
            </dl>

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
          </div>
        )}
      </aside>
    </>
  );
}
