import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { Money } from '../components/Money.tsx';
import { VoucherDrawer } from '../components/VoucherDrawer.tsx';
import { LiveSourcePane } from '../components/LiveSourcePane.tsx';
import { fetchVchTypes, isApiError, searchVouchers } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import { readRecentSearches, rememberSearch } from '../lib/recent-searches.ts';
import { PAGE_SIZE, VCH_TYPES } from '../lib/types.ts';
import type { SearchHit, SearchResponse } from '../lib/types.ts';

function highlight(text: string | null | undefined, q: string) {
  if (text == null || text === '') return text ?? '';
  const needle = q.trim();
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'ig'));
  const lower = needle.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === lower ? (
      <mark className="search-hl" key={i}>{part}</mark>
    ) : (
      part
    ),
  );
}

function truncate(text: string, max = 90): string {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function SearchPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const vchType = params.get('vchType') ?? '';
  const offset = Math.max(0, Number(params.get('offset') || '0') || 0);
  const voucherParam = params.get('voucher');
  const browse = params.get('browse') === '1';
  const voucherId = voucherParam && /^\d+$/.test(voucherParam) ? Number(voucherParam) : null;

  const isResults = Boolean(q || from || to || vchType || browse || voucherId);

  const [draftQ, setDraftQ] = useState(q);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [draftType, setDraftType] = useState(vchType);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [printOnOpen, setPrintOnOpen] = useState(false);
  const [vchTypes, setVchTypes] = useState<string[]>([...VCH_TYPES]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftQ(q);
    setDraftFrom(from);
    setDraftTo(to);
    setDraftType(vchType);
  }, [q, from, to, vchType]);

  useEffect(() => {
    if (user) setRecent(readRecentSearches(user.id));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    fetchVchTypes()
      .then((res) => {
        if (!cancelled && res.items.length > 0) setVchTypes(res.items);
      })
      .catch(() => {
        /* keep fixture fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const writeParams = (next: {
    q?: string;
    from?: string;
    to?: string;
    vchType?: string;
    offset?: number;
    voucher?: string | null;
    browse?: boolean;
  }) => {
    const sp = new URLSearchParams();
    const nextQ = next.q !== undefined ? next.q : q;
    const nextFrom = next.from !== undefined ? next.from : from;
    const nextTo = next.to !== undefined ? next.to : to;
    const nextType = next.vchType !== undefined ? next.vchType : vchType;
    const nextOffset = next.offset !== undefined ? next.offset : offset;
    const nextVoucher = next.voucher !== undefined ? next.voucher : voucherParam;
    const nextBrowse = next.browse !== undefined ? next.browse : browse;
    if (nextQ.trim()) sp.set('q', nextQ.trim().slice(0, 200));
    if (nextFrom) sp.set('from', nextFrom);
    if (nextTo) sp.set('to', nextTo);
    if (nextType) sp.set('vchType', nextType);
    if (nextOffset > 0) sp.set('offset', String(nextOffset));
    if (nextBrowse && !nextQ.trim() && !nextFrom && !nextTo && !nextType) sp.set('browse', '1');
    if (nextVoucher) sp.set('voucher', nextVoucher);
    setParams(sp, { replace: false });
  };

  const runSearch = (opts?: { browse?: boolean }) => {
    let fromDate = draftFrom;
    let toDate = draftTo;
    if (fromDate && toDate && fromDate > toDate) {
      const swap = fromDate;
      fromDate = toDate;
      toDate = swap;
    }
    writeParams({
      q: draftQ,
      from: fromDate,
      to: toDate,
      vchType: draftType,
      offset: 0,
      browse: opts?.browse || (!draftQ.trim() && !fromDate && !toDate && !draftType),
      voucher: null,
    });
  };

  useEffect(() => {
    if (!isResults) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const body: { q?: string; from?: string; to?: string; vchType?: string; limit: number; offset: number } = {
          limit: PAGE_SIZE,
          offset,
        };
        if (q.trim()) body.q = q.trim().slice(0, 200);
        if (from) body.from = from;
        if (to) body.to = to;
        if (vchType) body.vchType = vchType;
        const data = await searchVouchers(body);
        if (cancelled) return;
        setResult(data);
        if (user && q.trim()) setRecent(rememberSearch(user.id, q.trim()));
      } catch (err) {
        if (cancelled) return;
        setResult(null);
        setError(isApiError(err) ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isResults, q, from, to, vchType, offset, user]);

  const showCompany = !user?.companyId;
  const total = result?.total ?? 0;
  const fromRow = total === 0 ? 0 : offset + 1;
  const toRow = Math.min(offset + PAGE_SIZE, total);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  const openVoucher = (id: number) => {
    writeParams({ voucher: String(id) });
  };

  const closeVoucher = () => {
    writeParams({ voucher: null });
  };

  const copyNo = async (hit: SearchHit, e: ReactMouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hit.vchNo);
      setCopiedId(hit.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === hit.id ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  };

  const printVoucher = (hit: SearchHit, e: ReactMouseEvent) => {
    e.stopPropagation();
    setPrintOnOpen(true);
    writeParams({ voucher: String(hit.id) });
  };

  const onRowKey = (e: ReactKeyboardEvent, id: number) => {
    if (e.key === 'Enter') openVoucher(id);
  };

  const filters = useMemo(
    () => (
      <div className="filter-fields">
        <label className="field">
          <span>From</span>
          <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
        </label>
        <label className="field">
          <span>Voucher type</span>
          <select value={draftType} onChange={(e) => setDraftType(e.target.value)}>
            <option value="">Any</option>
            {vchTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
            {draftType && !vchTypes.includes(draftType) && (
              <option value={draftType}>{draftType}</option>
            )}
          </select>
        </label>
      </div>
    ),
    [draftFrom, draftTo, draftType, vchTypes],
  );

  if (!isResults) {
    return (
      <div className="landing">
        <h1 className="landing-title">Find a bill</h1>
        <form className="landing-form" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            className="search-hero"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Bill number, party, narration, amount"
            aria-label="Find a bill"
            maxLength={200}
          />
          <div className="landing-actions">
            <button type="submit" className="btn btn-primary">Search</button>
            <button type="button" className="btn btn-ghost" onClick={() => runSearch({ browse: true })}>
              Browse all
            </button>
          </div>
          <details className="landing-filters">
            <summary>Date and type filters</summary>
            {filters}
            <button type="submit" className="btn btn-secondary">Apply filters</button>
          </details>
        </form>
        <LiveSourcePane kind="vouchers" />
        {recent.length > 0 && (
          <div className="recent">
            <h2>Recent searches</h2>
            <ul>
              {recent.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    className="recent-item"
                    onClick={() => {
                      setDraftQ(item);
                      writeParams({ q: item, from: '', to: '', vchType: '', offset: 0, browse: false, voucher: null });
                    }}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="results-page">
      <form className="results-search" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="search-compact"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          placeholder="Bill number, party, narration, amount"
          aria-label="Find a bill"
          maxLength={200}
        />
        <button type="submit" className="btn btn-primary">Search</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setParams(new URLSearchParams(), { replace: false })}
        >
          Clear
        </button>
      </form>

      <LiveSourcePane kind="vouchers" />

      <div className="results-layout">
        <aside className="filter-rail">
          <h2>Filters</h2>
          {filters}
          <button type="button" className="btn btn-secondary btn-block" onClick={() => runSearch()}>
            Apply
          </button>
        </aside>

        <section className="results-main">
          {error && <p className="form-error" role="alert">{error}</p>}
          {loading && <p className="muted">Searching…</p>}
          {!loading && result && result.hits.length === 0 && (
            <div className="empty-state">
              <h2>No vouchers matched</h2>
              <p className="empty-copy">
                {(from || to || vchType)
                  ? 'Try loosening the date range or voucher type, or clear filters.'
                  : 'Nothing published matches this search.'}
              </p>
            </div>
          )}
          {!loading && result && result.hits.length > 0 && (
            <>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Particulars</th>
                    <th>Type</th>
                    <th>Voucher no.</th>
                    <th className="num">Amount</th>
                    {showCompany && <th>Company</th>}
                    <th className="actions-col"> </th>
                  </tr>
                </thead>
                <tbody>
                  {result.hits.map((hit) => (
                    <tr
                      key={hit.id}
                      className="clickable"
                      tabIndex={0}
                      onClick={() => openVoucher(hit.id)}
                      onKeyDown={(e) => onRowKey(e, hit.id)}
                    >
                      <td className="nowrap">{formatDate(hit.vchDate)}</td>
                      <td>
                        <div className="particulars">
                          <span className="party">{highlight(hit.partyName, q)}</span>
                          {hit.narration && (
                            <span className="narration">{highlight(truncate(hit.narration), q)}</span>
                          )}
                        </div>
                      </td>
                      <td>{hit.vchType}</td>
                      <td className="nowrap td-key">
                        <span className="key-value">{highlight(hit.vchNo, q)}</span>
                      </td>
                      <td className="num"><Money value={hit.totalAmount} /></td>
                      {showCompany && <td>{hit.companyId}</td>}
                      <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="linkish" onClick={() => openVoucher(hit.id)}>View</button>
                        <button type="button" className="linkish" onClick={(e) => void copyNo(hit, e)}>
                          {copiedId === hit.id ? 'Copied' : 'Copy'}
                        </button>
                        <button type="button" className="linkish" onClick={(e) => printVoucher(hit, e)}>Print</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pager">
                <span className="muted">
                  {fromRow}–{toRow} of {total}
                </span>
                <div className="pager-btns">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={offset <= 0}
                    onClick={() => writeParams({ offset: Math.max(0, offset - PAGE_SIZE) })}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => writeParams({ offset: offset + PAGE_SIZE })}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {voucherId && (
        <VoucherDrawer
          id={voucherId}
          onClose={() => {
            setPrintOnOpen(false);
            closeVoucher();
          }}
          printOnOpen={printOnOpen}
          onPrinted={() => setPrintOnOpen(false)}
        />
      )}
    </div>
  );
}
