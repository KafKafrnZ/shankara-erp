import { useEffect, useState } from 'react';
import { api, isApiError } from '../lib/api.ts';
import { formatDate } from '../lib/format.ts';
import { itemPrimaryKey } from '../lib/item-key.ts';
import { useAuth } from '../auth/useAuth.ts';
import { ItemEditForm, emptyItemFormValues } from './ItemEditForm.tsx';
import type { ItemFormValues } from './ItemEditForm.tsx';
import { ItemUploadFlow } from './ItemUploadFlow.tsx';
import { buildExcelPasteText, exportToExcel } from '../lib/excel-export.ts';
import type { ExportableRow } from '../lib/excel-export.ts';
import { motion, useReducedMotion } from 'framer-motion';
type Props = {
  /** null means "creating a new item" — no history to load, no code yet. */
  itemCode: string | null;
  onClose: () => void;
  /** Only used in create mode: fires once the new item is saved. */
  onCreated?: (itemCode: string) => void;
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
  extra: Record<string, string> | null;
  isDeleted: boolean;
  validFrom: string;
  validTo: string | null;
}

function formValuesFromRow(row: ItemHistoryRow): ItemFormValues {
  return {
    itemCode: row.itemCode,
    itemName: row.itemName,
    brand: row.brand || '',
    catalogueNo: row.catalogueNo || '',
    sapItemCode: row.sapItemCode || '',
    alias: row.alias || '',
    mainGroup: row.mainGroup || '',
    subGroup: row.subGroup || '',
    uom: row.uom || '',
    hsnDescription: row.hsnDescription || '',
    extra: Object.entries(row.extra || {}).map(([key, value]) => ({ key, value })),
  };
}

export function ItemDrawer({ itemCode, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const isSteward = user?.role === 'steward';
  const creating = itemCode === null;

  const [history, setHistory] = useState<ItemHistoryRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!creating);
  const [copied, setCopied] = useState(false);
  const [copyText, setCopyText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [createMode, setCreateMode] = useState<'manual' | 'upload'>('manual');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setMode('view');
    setCreateMode('manual');
    setConfirmingDelete(false);
    setDeleteError('');
    if (creating || !itemCode) {
      setHistory([]);
      setLoading(false);
      return;
    }
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
  }, [itemCode, creating]);

  const current = history[0];
  const key = current ? itemPrimaryKey(current) : null;

  // Copies every field the catalog has as a tab-separated header row + one
  // data row — pasted into an open Excel sheet, that lands as real columns
  // immediately, the same shape "Export to Excel" produces as a file. Goes
  // through /bulk (not the already-loaded `current`) so blank fields this
  // item has no value for still show up as empty columns, matching every
  // other field the sheet has — not just whatever happens to be set here.
  const copyDetails = async () => {
    if (!current) return;
    setCopyError('');
    try {
      const rows = await api<ExportableRow[]>('/api/item-search/bulk', {
        method: 'POST',
        body: JSON.stringify({ itemCodes: [current.itemCode] }),
      });
      const text = buildExcelPasteText(rows);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setCopyText('');
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopyText(text);
      }
    } catch (err) {
      setCopyError(isApiError(err) ? err.message : "Couldn't copy — try again.");
    }
  };

  const onExport = async () => {
    if (!current) return;
    setExporting(true);
    setExportError('');
    try {
      await exportToExcel([current.itemCode], `${current.itemCode}.xlsx`);
    } catch {
      setExportError("Couldn't export — try again.");
    } finally {
      setExporting(false);
    }
  };

  const refetchHistory = async () => {
    if (!itemCode) return;
    try {
      const data = await api<ItemHistoryRow[]>(`/api/item-search/history/${encodeURIComponent(itemCode)}`);
      setHistory(data);
    } catch {
      /* the edit/delete action already reported its own error */
    }
  };

  const onDelete = async () => {
    if (!itemCode) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api(`/api/item-master/rows/${encodeURIComponent(itemCode)}`, { method: 'DELETE' });
      await refetchHistory();
      setConfirmingDelete(false);
    } catch (err) {
      setDeleteError(isApiError(err) ? err.message : 'Could not remove this item');
    } finally {
      setDeleting(false);
    }
  };

  const headTitle = creating ? 'New item' : current?.itemName || 'Item Master';

  return (
    <>
      <motion.div
        className="drawer-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
      />
      <motion.aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={creating ? 'New item' : 'Item detail'}
        initial={{ x: prefersReducedMotion ? 0 : '100%' }}
        animate={{ x: 0 }}
        exit={{ x: prefersReducedMotion ? 0 : '100%' }}
        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 200 }}
      >
        <div className="drawer-head">
          <div>
            {creating ? (
              <h2 className="drawer-title">New item</h2>
            ) : current ? (
              <>
                <div className="drawer-kicker">
                  {current.isDeleted ? 'Removed from catalog' : current.brand || 'No brand'}
                </div>
                <h2 className="drawer-title">{current.itemName}</h2>
                <p className="drawer-sub">
                  <span className="key-kicker">{key?.label}</span>
                  <span className="key-value">{key?.value || current.itemCode}</span>
                </p>
              </>
            ) : (
              <h2 className="drawer-title">{headTitle}</h2>
            )}
          </div>
          <div className="drawer-actions">
            {!creating && current && !current.isDeleted && mode === 'view' && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => void copyDetails()}>
                  {copied ? 'Copied' : 'Copy details'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void onExport()} disabled={exporting}>
                  {exporting ? 'Exporting…' : 'Export to Excel'}
                </button>
                {isSteward && (
                  <button type="button" className="btn btn-ghost" onClick={() => setMode('edit')}>
                    Edit
                  </button>
                )}
                {isSteward && (
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmingDelete(true)}>
                    Delete
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {creating && (
            <>
              <div className="item-create-tabs" role="tablist" aria-label="Add items">
                <button
                  type="button"
                  role="tab"
                  aria-selected={createMode === 'manual'}
                  className={createMode === 'manual' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setCreateMode('manual')}
                >
                  Add one by hand
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={createMode === 'upload'}
                  className={createMode === 'upload' ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setCreateMode('upload')}
                >
                  Upload an Excel sheet
                </button>
              </div>

              {createMode === 'manual' ? (
                <ItemEditForm
                  initial={emptyItemFormValues()}
                  lockItemCode={false}
                  onCancel={onClose}
                  onSaved={(code) => onCreated?.(code)}
                />
              ) : (
                <>
                  <p className="muted" style={{ marginBottom: '16px' }}>
                    Upload a sheet with any number of items — codes that already exist in the live
                    catalog get updated, new codes get added. Nothing changes until you review it and
                    choose to merge it in.
                  </p>
                  <ItemUploadFlow onPublished={onClose} />
                </>
              )}
            </>
          )}

          {!creating && error && <p className="empty-copy">{error}</p>}
          {!creating && loading && !error && <p className="muted">Loading…</p>}
          {/* The API returns [] (not a 404) for an unknown code, so without
              this the drawer opened completely blank — no data, no message. */}
          {!creating && !loading && !error && !current && (
            <p className="empty-copy">
              No details found for this item. It may have been removed from the catalog since this
              list was loaded — try searching for it again.
            </p>
          )}

          {!creating && !loading && !error && current && mode === 'edit' && (
            <ItemEditForm
              initial={formValuesFromRow(current)}
              lockItemCode
              onCancel={() => setMode('view')}
              onSaved={() => {
                setMode('view');
                void refetchHistory();
              }}
            />
          )}

          {!creating && !loading && !error && current && mode === 'view' && (
            <>
              {confirmingDelete && (
                <div className="banner banner-warning">
                  <p className="banner-title">Remove {current.itemName} from the catalog?</p>
                  <p>It stops showing in search right away. This stays in the item's history and a steward can add it back later.</p>
                  {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
                  <div className="batch-actions">
                    <button type="button" className="btn btn-primary" disabled={deleting} onClick={() => void onDelete()}>
                      {deleting ? 'Removing…' : 'Yes, remove it'}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {current.isDeleted ? (
                <div className="empty-state">
                  <h2>Removed from the catalog</h2>
                  <p className="empty-copy">
                    This item was removed and no longer shows in search. Its details are kept below in case it needs to come back.
                  </p>
                  {isSteward && (
                    <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}>
                      Add it back
                    </button>
                  )}
                </div>
              ) : (
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
                  {Object.entries(current.extra || {}).map(([field, value]) => (
                    <div key={field}>
                      <dt>{field}</dt>
                      <dd>{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {exportError && <p className="form-error" role="alert">{exportError}</p>}
              {copyError && <p className="form-error" role="alert">{copyError}</p>}

              {copyText && (
                <label className="field" style={{ marginBottom: '16px' }}>
                  <span>Clipboard blocked — select and copy this</span>
                  <textarea readOnly rows={6} value={copyText} />
                </label>
              )}

              <h3 style={{ fontSize: '13px', marginTop: '24px', marginBottom: '8px' }}>Version History</h3>
              <div className="table-scroll">
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
                        <td>{row.validTo ? formatDate(row.validTo) : row.isDeleted ? 'Removed' : 'Current'}</td>
                        <td>
                          <div>{row.itemName}</div>
                          <div className="muted">{row.brand}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </>
  );
}
