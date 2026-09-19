import { useEffect, useState, useMemo, useRef } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { ItemDrawer } from '../components/ItemDrawer.tsx';
import { LiveSourcePane } from '../components/LiveSourcePane.tsx';
import { FilterBar } from '../components/FilterBar.tsx';
import { SelectionTray } from '../components/SelectionTray.tsx';
import { exportFilteredToExcel } from '../lib/excel-export.ts';
import { itemPrimaryKey } from '../lib/item-key.ts';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

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

interface AvailableField {
  key: string;
  count: number;
}

const PAGE_SIZE = 50;
// "SI No." from an uploaded file can't collide with these, but a real
// column literally named "brand" or "q" could — the prefix keeps every
// dynamic filter's URL param distinct from the fixed ones.
const EXTRA_PARAM_PREFIX = 'xf:';

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
  // Which way the page just moved (Next vs Previous vs a filter/search
  // reset) — derived from the offset change itself rather than set at each
  // call site, so every path that can change `offset` (pager buttons,
  // filters, a fresh search) gets a correctly-directional row animation for
  // free instead of only the two pager buttons.
  const prevOffsetRef = useRef(offset);
  const [pageDir, setPageDir] = useState(0);
  useEffect(() => {
    const prev = prevOffsetRef.current;
    setPageDir(offset > prev ? 1 : offset < prev ? -1 : 0);
    prevOffsetRef.current = offset;
  }, [offset]);
  const prefersReducedMotion = useReducedMotion();
  const browse = searchParams.get('browse') === 'true';
  const itemCode = searchParams.get('itemCode');
  const creatingNew = searchParams.get('new') === 'true';

  // Which extra (uploaded-file) columns are active filters right now, and
  // their committed values — both live in the URL the same way the fixed
  // filters do, so a shared/bookmarked search link carries them too.
  const activeExtraKeys = useMemo(
    () => (searchParams.get('xfields') || '').split('|').filter(Boolean),
    [searchParams],
  );
  const committedExtra = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of activeExtraKeys) {
      const v = searchParams.get(`${EXTRA_PARAM_PREFIX}${key}`) || '';
      if (v) out[key] = v;
    }
    return out;
  }, [searchParams, activeExtraKeys]);
  const extraFilterKey = activeExtraKeys.map((k) => `${k}=${committedExtra[k] || ''}`).join('&');

  const [draftQ, setDraftQ] = useState(q);
  const [draftMainGroup, setDraftMainGroup] = useState(mainGroup);
  const [draftSubGroup, setDraftSubGroup] = useState(subGroup);
  const [draftBrand, setDraftBrand] = useState(brand);
  const [draftExtraKeys, setDraftExtraKeys] = useState<string[]>(activeExtraKeys);
  const [draftExtraValues, setDraftExtraValues] = useState<Record<string, string>>(committedExtra);

  const [facets, setFacets] = useState<Facets>({ mainGroup: [], subGroup: [], brand: [] });
  const [availableFields, setAvailableFields] = useState<AvailableField[]>([]);
  const [extraOptions, setExtraOptions] = useState<Record<string, FacetOption[]>>({});
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Deliberately not reset by a new search — checking a box, searching
  // again, and checking more only works if this survives across searches.
  // Keyed by item code, valued by name — the review list in the tray needs
  // something more readable than a bare code to show what was picked.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllNotice, setExportAllNotice] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const isResults = browse || q || mainGroup || subGroup || brand || activeExtraKeys.length > 0;

  useEffect(() => {
    api<Facets>('/api/item-search/facets')
      .then(setFacets)
      .catch(console.error);
    api<AvailableField[]>('/api/item-search/fields')
      .then(setAvailableFields)
      .catch(console.error);
  }, []);

  // Fetch the value dropdown for any extra filter chip that doesn't have
  // one cached yet — covers both a freshly-added chip (still draft-only)
  // and one restored straight from a shared URL (already committed).
  useEffect(() => {
    const missing = draftExtraKeys.filter((k) => !(k in extraOptions));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (key): Promise<[string, FacetOption[]]> => {
          try {
            const options = await api<FacetOption[]>(`/api/item-search/facets/extra?field=${encodeURIComponent(key)}`);
            return [key, options];
          } catch {
            return [key, []];
          }
        }),
      );
      if (cancelled) return;
      setExtraOptions((prev) => {
        const next = { ...prev };
        for (const [key, options] of entries) next[key] = options;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [draftExtraKeys, extraOptions]);

  // Auto-focus the search box, and let "/" jump to it from anywhere on this
  // page — a standard search-box shortcut worth having on the one search
  // box left in the app.
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
        const payload: Record<string, string | number | Record<string, string>> = { limit: PAGE_SIZE, offset };
        if (q) payload.q = q;
        if (mainGroup) payload.mainGroup = mainGroup;
        if (subGroup) payload.subGroup = subGroup;
        if (brand) payload.brand = brand;
        if (Object.keys(committedExtra).length > 0) payload.extra = committedExtra;
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
    // committedExtra is derived fresh every render from searchParams;
    // extraFilterKey is its stable, comparable fingerprint for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResults, q, mainGroup, subGroup, brand, offset, browse, extraFilterKey]);

  useEffect(() => {
    setDraftQ(q);
    setDraftMainGroup(mainGroup);
    setDraftSubGroup(subGroup);
    setDraftBrand(brand);
    setDraftExtraKeys(activeExtraKeys);
    setDraftExtraValues(committedExtra);
    // activeExtraKeys/committedExtra are derived fresh every render;
    // extraFilterKey (which also encodes the active key list, since it's
    // built from activeExtraKeys) is their stable fingerprint for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mainGroup, subGroup, brand, extraFilterKey]);

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

  const openItem = (code: string) => writeParams({ itemCode: code, new: null });
  const closeItem = () => writeParams({ itemCode: null, new: null });
  const openNewItem = () => writeParams({ new: true, itemCode: null });

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

  // A stale "showing the first 20,000 of..." notice from a previous filter
  // would otherwise linger and misdescribe the new result set.
  useEffect(() => {
    setExportAllNotice('');
  }, [q, mainGroup, subGroup, brand, extraFilterKey]);

  const onExportAll = async () => {
    setExportingAll(true);
    setExportAllNotice('');
    try {
      const filenameBits = [mainGroup, subGroup, brand].filter(Boolean).join('-') || 'search';
      const { truncated, rowCount } = await exportFilteredToExcel(
        { q: q || undefined, mainGroup: mainGroup || undefined, subGroup: subGroup || undefined, brand: brand || undefined, extra: Object.keys(committedExtra).length > 0 ? committedExtra : undefined },
        `catalog-export-${filenameBits}.xlsx`,
      );
      setExportAllNotice(
        truncated
          ? `Downloaded the first ${rowCount.toLocaleString('en-IN')} matching items — narrow the filters to get the rest.`
          : `Downloaded all ${rowCount.toLocaleString('en-IN')} matching items.`,
      );
    } catch {
      setExportAllNotice("Couldn't export — try again.");
    } finally {
      setExportingAll(false);
    }
  };

  const toggleSelect = (code: string, name: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(code)) next.delete(code);
      else next.set(code, name);
      return next;
    });
  };

  const fixedFilterFields = useMemo(
    () => [
      { key: 'mainGroup', label: 'Main Group', value: draftMainGroup, onChange: setDraftMainGroup, options: facets.mainGroup },
      { key: 'subGroup', label: 'Sub Group', value: draftSubGroup, onChange: setDraftSubGroup, options: facets.subGroup },
      { key: 'brand', label: 'Brand', value: draftBrand, onChange: setDraftBrand, options: facets.brand },
    ],
    [draftMainGroup, draftSubGroup, draftBrand, facets],
  );

  const setDraftExtraValue = (key: string, value: string) =>
    setDraftExtraValues((prev) => ({ ...prev, [key]: value }));

  const extraFilterFields = useMemo(
    () => draftExtraKeys.map((key) => ({
      key,
      label: key,
      value: draftExtraValues[key] || '',
      onChange: (v: string) => setDraftExtraValue(key, v),
      options: extraOptions[key] || [],
    })),
    [draftExtraKeys, draftExtraValues, extraOptions],
  );

  const onAddExtraField = (key: string) => {
    setDraftExtraKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setDraftExtraValues((prev) => (key in prev ? prev : { ...prev, [key]: '' }));
  };

  const onRemoveExtraField = (key: string) => {
    setDraftExtraKeys((prev) => prev.filter((k) => k !== key));
    setDraftExtraValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const applyFilters = () => {
    const updates: Record<string, string | number | boolean | null> = {
      mainGroup: draftMainGroup,
      subGroup: draftSubGroup,
      brand: draftBrand,
      offset: 0,
      xfields: draftExtraKeys.length > 0 ? draftExtraKeys.join('|') : null,
    };
    // Clear the URL value for any key that was committed before but isn't
    // in the draft list anymore — writeParams only touches keys it's given.
    for (const key of activeExtraKeys) {
      if (!draftExtraKeys.includes(key)) updates[`${EXTRA_PARAM_PREFIX}${key}`] = null;
    }
    for (const key of draftExtraKeys) {
      updates[`${EXTRA_PARAM_PREFIX}${key}`] = draftExtraValues[key] || null;
    }
    writeParams(updates);
  };

  const total = Number(result?.total) || 0;
  const hitCount = result?.hits.length ?? 0;
  const fromRow = hitCount === 0 ? 0 : offset + 1;
  const toRow = offset + hitCount;
  const hasPrev = offset > 0;
  const hasNext = hitCount === PAGE_SIZE;

  // Entrance keeps its staggered rise-and-settle — that's the part that
  // reads as "the new page arriving". Exit is deliberately fast and
  // un-staggered: it used to inherit the same per-row `delay`, so with a
  // full 50-row page the last exiting row wouldn't even start leaving until
  // ~750ms in, and AnimatePresence's `mode="wait"` (required here — table
  // rows aren't absolutely positioned, so overlapping enter/exit would
  // double up visually) blocked the next page behind all of that. A quick,
  // non-staggered exit keeps that safety without the long dead pause.
  const rowVariants = {
    initial: ({ dir }: { i: number; dir: number }) => ({ opacity: 0, y: 12, x: dir * 16 }),
    animate: ({ i }: { i: number; dir: number }) => ({
      opacity: 1,
      y: 0,
      x: 0,
      transition: prefersReducedMotion
        ? { duration: 0 }
        : { type: 'spring' as const, damping: 22, stiffness: 250, delay: i * 0.015 },
    }),
    exit: ({ dir }: { i: number; dir: number }) => ({
      opacity: 0,
      x: dir * -16,
      transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.12 },
    }),
  };

  // The search bar lives in one fixed spot in the tree regardless of
  // isResults — only the content below it swaps. Landing and results used
  // to be two separate return statements with their own <form>/<input>,
  // which meant every search unmounted and remounted the whole page (lost
  // focus, visible flash, felt "broken"). Same DOM shape throughout means
  // React just re-renders the parts that changed.
  return (
    <div className={`catalog-page${itemCode || creatingNew ? ' has-drawer' : ''}`}>
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
        <button type="button" className="btn btn-secondary" onClick={openNewItem}>
          + New item
        </button>
      </header>

      <LiveSourcePane />

      {!isResults && (
        <p className="catalog-hint">Search by item code, name, or catalogue number — or browse the full catalog and filter by group and brand.</p>
      )}

      {isResults && (
        <div className="results-stack">
          <FilterBar
            fixedFields={fixedFilterFields}
            extraFields={extraFilterFields}
            onRemoveExtraField={onRemoveExtraField}
            availableFields={availableFields}
            onAddExtraField={onAddExtraField}
            onApply={applyFilters}
          />

          <section className="results-main">
            {error && <p className="form-error" role="alert">{error}</p>}
            {!loading && result && result.hits.length === 0 && (
              <div className="empty-state">
                <h2>No items matched</h2>
                <p className="empty-copy">Try loosening the filters or search terms.</p>
              </div>
            )}
            {result && result.hits.length > 0 && (
              <>
                <div className="table-scroll">
                  <table className={`results-table${loading ? ' is-loading' : ''}`}>
                    <thead>
                      <tr>
                        <th className="td-select"><span className="visually-hidden">Select</span></th>
                        <th>Code</th>
                        <th>Item Name</th>
                        <th>Brand</th>
                        <th>Group / Sub</th>
                        <th>UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence mode="wait">
                      {result.hits.map((hit, index) => {
                        const key = itemPrimaryKey(hit);
                        return (
                        <motion.tr
                          variants={rowVariants}
                          custom={{ i: index, dir: pageDir }}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          key={hit.id}
                          className="clickable"
                          tabIndex={0}
                          onClick={() => openItem(hit.itemCode)}
                          onKeyDown={(e) => onRowKey(e, hit.itemCode)}
                        >
                          <td className="td-select" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(hit.itemCode)}
                              onChange={() => toggleSelect(hit.itemCode, hit.itemName)}
                              aria-label={`Select ${hit.itemName}`}
                            />
                          </td>
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
                        </motion.tr>
                        );
                      })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <span className="muted">
                    {total > 0
                      ? `${fromRow}–${toRow} of ${total.toLocaleString('en-IN')}`
                      : `${fromRow}–${toRow}`}
                  </span>
                  <div className="pager-btns">
                    {total > PAGE_SIZE && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={exportingAll}
                        onClick={() => void onExportAll()}
                        title="Export every item matching the current search and filters, not just this page"
                      >
                        {exportingAll ? 'Exporting…' : `Export all ${total.toLocaleString('en-IN')} matching`}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!hasPrev || loading}
                      onClick={() => writeParams({ offset: Math.max(0, offset - PAGE_SIZE) })}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!hasNext || loading}
                      onClick={() => writeParams({ offset: offset + PAGE_SIZE })}
                    >
                      Next
                    </button>
                  </div>
                </div>
                {exportAllNotice && (
                  <p className="muted export-all-notice" role="status">{exportAllNotice}</p>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <AnimatePresence>
      {(itemCode || creatingNew) && (
        <ItemDrawer
          itemCode={creatingNew ? null : itemCode}
          onClose={creatingNew ? () => writeParams({ new: null }) : closeItem}
          onCreated={(code) => openItem(code)}
        />
      )}
      </AnimatePresence>

      <SelectionTray
        items={[...selected].map(([code, name]) => ({ code, name }))}
        onRemove={(code) => setSelected((prev) => {
          const next = new Map(prev);
          next.delete(code);
          return next;
        })}
        onClear={() => setSelected(new Map())}
      />
    </div>
  );
}
