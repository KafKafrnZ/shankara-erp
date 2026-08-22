import { useEffect, useState, useMemo, useRef } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { ItemDrawer } from '../components/ItemDrawer.tsx';
import { LiveSourcePane } from '../components/LiveSourcePane.tsx';
import { itemPrimaryKey } from '../lib/item-key.ts';


interface SearchHit {
  id: string;
  itemCode: string;
  catalogueNo: string | null;
  sapItemCode: string | null;
  alias: string | null;
  layoutKey: string | null;
  brand: string | null;
  itemName: string;
  mainGroup: string | null;
  subGroup: string | null;
  uom: string | null;
}

interface SearchResult {
  hits: SearchHit[];
  total: number;
}

interface FacetOption {
  value: string;
  count: number;
}

interface Facets {
  mainGroup: FacetOption[];
  subGroup: FacetOption[];
  brand: FacetOption[];
}

const PAGE_SIZE = 50;

function highlight(text: string | null | undefined, query: string) {
  if (!text) return null;
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.substring(0, idx)}
      <mark className="search-hl">{text.substring(idx, idx + q.length)}</mark>
      {text.substring(idx + q.length)}
    </>
  );
}

export function CatalogPage() {
  const [searchParams, setParams] = useSearchParams();
  
  const q = searchParams.get('q') || '';
  const mainGroup = searchParams.get('mainGroup') || '';
  const subGroup = searchParams.get('subGroup') || '';
  const brand = searchParams.get('brand') || '';
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;
  const browse = searchParams.get('browse') === 'true';
  const itemCode = searchParams.get('itemCode');

  const [draftQ, setDraftQ] = useState(q);
  const [draftMainGroup, setDraftMainGroup] = useState(mainGroup);
  const [draftSubGroup, setDraftSubGroup] = useState(subGroup);
  const [draftBrand, setDraftBrand] = useState(brand);

  const [facets, setFacets] = useState<Facets>({ mainGroup: [], subGroup: [], brand: [] });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const isResults = browse || q || mainGroup || subGroup || brand;

  useEffect(() => {
    api<Facets>('/api/item-search/facets')
      .then(setFacets)
      .catch(console.error);
  }, []);

  // Auto-focus the search box, and let "/" jump to it from anywhere on this
  // page — same shortcut the voucher search (SearchPage.tsx) already has;
  // this brings the catalog search bar to the same standard rather than
  // leaving it as the one search box in the app without it.
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

  // Live search as you type, debounced — Enter/the Search button still work
  // immediately for anyone who prefers that, this just means you don't have
  // to press either: typing and pausing is enough. Skipped once draftQ
  // already matches the committed q (nothing to do — covers the moment
  // right after a search just ran and avoids re-firing on every render).
  useEffect(() => {
    if (draftQ === q) return;
    const t = window.setTimeout(() => {
      writeParams({ q: draftQ || null, offset: 0, browse: draftQ ? false : null });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftQ]);

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
        const payload: Record<string, string | number> = { limit: PAGE_SIZE, offset };
        if (q) payload.q = q;
        if (mainGroup) payload.mainGroup = mainGroup;
        if (subGroup) payload.subGroup = subGroup;
        if (brand) payload.brand = brand;
        const res = await api<SearchResult>('/api/item-search', { method: 'POST', body: JSON.stringify(payload) });
        if (cancelled) return;
        setResult(res);
      } catch (err: unknown) {
        if (cancelled) return;
        setResult(null);
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isResults, q, mainGroup, subGroup, brand, offset, browse]);

  useEffect(() => {
    setDraftQ(q);
    setDraftMainGroup(mainGroup);
    setDraftSubGroup(subGroup);
    setDraftBrand(brand);
  }, [q, mainGroup, subGroup, brand]);

  const writeParams = (updates: Record<string, string | number | boolean | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '' || v === false) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: false });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draftQ && !draftMainGroup && !draftSubGroup && !draftBrand) {
      writeParams({ q: null, mainGroup: null, subGroup: null, brand: null, offset: 0, browse: true });
      return;
    }
    writeParams({ q: draftQ, mainGroup: draftMainGroup, subGroup: draftSubGroup, brand: draftBrand, offset: 0, browse: false });
    inputRef.current?.blur();
  };

  const openItem = (code: string) => writeParams({ itemCode: code });
  const closeItem = () => writeParams({ itemCode: null });

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (draftQ) {
        setDraftQ('');
      } else {
        inputRef.current?.blur();
      }
    }
  };

  const onRowKey = (e: ReactKeyboardEvent, code: string) => {
    if (e.key === 'Enter') openItem(code);
  };

  const filterBlocks = useMemo(
    () => (
      <div className="filter-fields">
        <label className="field">
          <span>Main Group</span>
          <select value={draftMainGroup} onChange={(e) => setDraftMainGroup(e.target.value)}>
            <option value="">Any</option>
            {facets.mainGroup.map((f) => (
              <option key={f.value} value={f.value}>{f.value} ({f.count})</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sub Group</span>
          <select value={draftSubGroup} onChange={(e) => setDraftSubGroup(e.target.value)}>
            <option value="">Any</option>
            {facets.subGroup.map((f) => (
              <option key={f.value} value={f.value}>{f.value} ({f.count})</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Brand</span>
          <select value={draftBrand} onChange={(e) => setDraftBrand(e.target.value)}>
            <option value="">Any</option>
            {facets.brand.map((f) => (
              <option key={f.value} value={f.value}>{f.value} ({f.count})</option>
            ))}
          </select>
        </label>
      </div>
    ),
    [draftMainGroup, draftSubGroup, draftBrand, facets],
  );

  const total = result?.total || 0;
  const fromRow = total === 0 ? 0 : offset + 1;
  const toRow = Math.min(offset + PAGE_SIZE, total);

  // The search bar lives in one fixed spot in the tree regardless of
  // isResults — only the content below it swaps. Landing and results used
  // to be two separate return statements with their own <form>/<input>,
  // which meant every search unmounted and remounted the whole page (lost
  // focus, visible flash, felt "broken"). Same DOM shape throughout means
  // React just re-renders the parts that changed.
  return (
    <div className="catalog-page">
      <header className="catalog-header">
        <h1 className="catalog-title">Find an item</h1>
        <form className="catalog-search-form" onSubmit={onSubmit}>
          <div className="search-hero-wrap catalog-search-input-wrap">
            <input
              ref={inputRef}
              className="search-hero"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Item code, name, catalogue no"
              aria-label="Search catalog"
              maxLength={200}
            />
          </div>
          <button type="submit" className="btn btn-primary">Search</button>
          {isResults ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setParams(new URLSearchParams(), { replace: false })}
            >
              Clear
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => writeParams({ browse: true, offset: 0 })}>
              Browse all
            </button>
          )}
        </form>
      </header>

      <LiveSourcePane kind="items" />

      {!isResults && (
        <p className="catalog-hint">Search by item code, name, or catalogue number — or browse the full catalog and filter by group and brand.</p>
      )}

      {isResults && (
        <div className="results-layout">
          <aside className="filter-rail">
            <h2>Filters</h2>
            {filterBlocks}
            <button type="button" className="btn btn-secondary btn-block" onClick={() => writeParams({ mainGroup: draftMainGroup, subGroup: draftSubGroup, brand: draftBrand, offset: 0 })}>
              Apply
            </button>
          </aside>

          <section className="results-main">
            {error && <p className="form-error" role="alert">{error}</p>}
            {loading && <p className="muted">Searching…</p>}
            {!loading && result && result.hits.length === 0 && (
              <div className="empty-state">
                <h2>No items matched</h2>
                <p className="empty-copy">Try loosening the filters or search terms.</p>
              </div>
            )}
            {!loading && result && result.hits.length > 0 && (
              <>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Item Name</th>
                      <th>Brand</th>
                      <th>Group / Sub</th>
                      <th>UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.hits.map((hit) => {
                      const key = itemPrimaryKey(hit);
                      return (
                      <tr
                        key={hit.id}
                        className="clickable"
                        tabIndex={0}
                        onClick={() => openItem(hit.itemCode)}
                        onKeyDown={(e) => onRowKey(e, hit.itemCode)}
                      >
                        <td className="nowrap td-key">
                          <span className="key-kicker">{key.label}</span>
                          <span className="key-value">{highlight(key.value, q)}</span>
                        </td>
                        <td>
                          <div className="particulars">
                            <span className="party">{highlight(hit.itemName, q)}</span>
                            <span className="narration">
                              {hit.catalogueNo && key.kind !== 'catalogueNo' ? <>Cat no: {highlight(hit.catalogueNo, q)}</> : '—'}
                            </span>
                          </div>
                        </td>
                        <td>{hit.brand ? highlight(hit.brand, q) : '—'}</td>
                        <td>
                          {hit.mainGroup ? hit.mainGroup : '—'}
                          {hit.subGroup && ` / ${hit.subGroup}`}
                        </td>
                        <td>{hit.uom || '—'}</td>
                      </tr>
                      );
                    })}
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
      )}

      {itemCode && (
        <ItemDrawer
          itemCode={itemCode}
          onClose={closeItem}
        />
      )}
    </div>
  );
}
