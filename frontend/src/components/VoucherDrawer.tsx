import { useEffect, useState } from 'react';
import { fetchVoucher, isApiError } from '../lib/api.ts';
import { formatAsOf, formatDate } from '../lib/format.ts';
import type { VoucherDetail } from '../lib/types.ts';
import { Money } from './Money.tsx';

type Props = {
  id: number;
  onClose: () => void;
  printOnOpen?: boolean;
  onPrinted?: () => void;
};

export function VoucherDrawer({ id, onClose, printOnOpen, onPrinted }: Props) {
  const [data, setData] = useState<VoucherDetail | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!data || !printOnOpen) return;
    const t = window.setTimeout(() => {
      window.print();
      onPrinted?.();
    }, 50);
    return () => window.clearTimeout(t);
  }, [data, printOnOpen, onPrinted]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    (async () => {
      try {
        const voucher = await fetchVoucher(id);
        if (!cancelled) setData(voucher);
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && (err.status === 404 || err.status === 403)) {
          setError('Voucher not found');
        } else if (isApiError(err)) {
          setError(err.message);
        } else {
          setError('Failed to load voucher');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const copyNo = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.vchNo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const publishedLine = data
    ? [
        data.source.publishedAt ? `Published ${formatAsOf(data.source.publishedAt)}` : null,
        data.source.fileName ? `from ${data.source.fileName}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Voucher detail">
        <div className="drawer-head">
          <div>
            {data ? (
              <>
                <div className="drawer-kicker">{data.vchType}</div>
                <h2 className="drawer-title">{data.vchNo}</h2>
                <p className="drawer-sub">{data.partyName}</p>
              </>
            ) : (
              <h2 className="drawer-title">Voucher</h2>
            )}
          </div>
          <div className="drawer-actions">
            {data && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => void copyNo()}>
                  {copied ? 'Copied' : 'Copy no.'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
                  Print
                </button>
              </>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="drawer-body print-voucher">
        {error && <p className="empty-copy">{error}</p>}
        {!error && !data && <p className="muted">Loading…</p>}

        {data && (
          <>
            <dl className="meta-grid">
              <div>
                <dt>Date</dt>
                <dd>{formatDate(data.vchDate)}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{data.companyId}</dd>
              </div>
              <div>
                <dt>Party</dt>
                <dd>{data.partyName}</dd>
              </div>
              {data.narration && (
                <div className="meta-span">
                  <dt>Narration</dt>
                  <dd>{data.narration}</dd>
                </div>
              )}
            </dl>

            <table className="lines-table">
              <thead>
                <tr>
                  <th>Ledger</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.lineNo}>
                    <td>{line.ledgerName}</td>
                    <td className="num"><Money value={line.debit} /></td>
                    <td className="num"><Money value={line.credit} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th className="num"><Money value={data.totalAmount} /></th>
                  <th className="num"><Money value={data.totalAmount} /></th>
                </tr>
              </tfoot>
            </table>

            {publishedLine && <p className="provenance">{publishedLine}</p>}
          </>
        )}
        </div>
      </aside>
    </>
  );
}
