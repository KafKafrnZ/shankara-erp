import { useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, isApiError } from '../lib/api.ts';
import { describeItemBatchError, describeItemSkip } from '../lib/item-skip-codes.ts';
import { isSpreadsheetFilename } from '../lib/spreadsheet-filename.ts';
import { formatAsOf } from '../lib/format.ts';
import { useAuth } from '../auth/useAuth.ts';
import { SheetDestination } from './SheetDestination.tsx';
import type { SheetPick } from './SheetDestination.tsx';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface UploadResponse {
  batchId: number;
  status: string;
  duplicate: boolean;
  retried?: boolean;
  sha256: string;
  originalName: string;
}

interface MergeSummary {
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  duplicateAliasCount: number;
  remappedByAliasCount: number;
  ambiguousAliasCount: number;
}

interface ItemBatch {
  id: string;
  status: 'processing' | 'held' | 'published' | 'rejected';
  totalSheets: number;
  recognizedSheets: number;
  skippedSheets: number;
  totalRows: number;
  acceptedRows: number;
  skippedRows: number;
  errorSummary: string | null;
  uploadedAt: string;
  mergeSummary?: MergeSummary | null;
  sourceFile?: { originalName: string } | null;
}

const ACCEPT = [
  '.xlsx',
  '.xls',
  '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
].join(',');

function statusPill(status: string) {
  switch (status) {
    case 'processing': return <span className="pill pill-info">Processing</span>;
    case 'held': return <span className="pill pill-warning">Held</span>;
    case 'published': return <span className="pill pill-success">Published</span>;
    case 'rejected': return <span className="pill pill-critical">Rejected</span>;
    default: return <span className="pill">{status}</span>;
  }
}

type Props = {
  /** When set, the in-progress batch id is synced to this URL search-param
   *  so a reload (or a link from LiveSourcePane) can pick it back up — same
   *  behavior /catalog/upload has always had. Omit to keep the batch id as
   *  local-only state, for embedding this flow inside a modal/drawer that
   *  shouldn't hijack the host page's own URL params. */
  persistParam?: string;
  /** Fires once, the moment a batch first reaches 'published'. */
  onPublished?: () => void;
  /** Fires whenever the batch's id or status changes (including to null) —
   *  lets a host page keep something like LiveSourcePane's refreshKey in
   *  sync without reaching into this component's internal state. */
  onBatchChange?: (batch: { id: string; status: ItemBatch['status'] } | null) => void;
};

// The full upload → process → pick new/existing sheet → publish/hold flow.
// Shared by /catalog/upload and the "+ New item" drawer's Excel tab.
export function ItemUploadFlow({ persistParam, onPublished, onBatchChange }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [localBatchId, setLocalBatchId] = useState<number | null>(null);
  const batchIdParam = persistParam
    ? searchParams.get(persistParam)
    : localBatchId != null
      ? String(localBatchId)
      : null;

  const setBatchId = (id: number | null) => {
    if (persistParam) {
      const next = new URLSearchParams(searchParams);
      if (id == null) next.delete(persistParam);
      else next.set(persistParam, String(id));
      setSearchParams(next, { replace: false });
    } else {
      setLocalBatchId(id);
    }
  };

  const prefersReducedMotion = useReducedMotion();

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

  const [batch, setBatch] = useState<ItemBatch | null>(null);
  const [skips, setSkips] = useState<any[]>([]);
  const [skipTotal, setSkipTotal] = useState(0);
  const [skipOffset, setSkipOffset] = useState(0);
  const SKIP_PAGE = 50;
  const [busy, setBusy] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [confirmingHold, setConfirmingHold] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firedPublished = useRef(false);

  const { user } = useAuth();

  useEffect(() => {
    setConfirmingPublish(false);
    setConfirmingHold(false);
    setSkipOffset(0);
    if (!batchIdParam) {
      setBatch(null);
      setPollTimeout(false);
      return;
    }
    loadBatch(Number(batchIdParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchIdParam]);

  useEffect(() => {
    let t: number;
    if (batch && batch.status === 'processing') {
      const startedAt = Date.now();
      t = window.setInterval(() => {
        if (Date.now() - startedAt > 120_000) {
          clearInterval(t);
          setPollTimeout(true);
          return;
        }
        loadBatch(Number(batch.id));
      }, 2000);
    } else {
      setPollTimeout(false);
    }
    return () => clearInterval(t);
    // retryNonce is intentionally in the deps but otherwise unused here: a
    // retry can put a batch back into 'processing' when it was ALREADY
    // 'processing' (the stuck case), which wouldn't otherwise register as
    // a dependency change and restart this timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id, batch?.status, retryNonce]);

  useEffect(() => {
    if (!batch || batch.status === 'processing') return;
    if (!(batch.skippedRows > 0 || batch.skippedSheets > 0)) {
      setSkips([]);
      setSkipTotal(0);
      return;
    }
    let cancelled = false;
    const page = Math.floor(skipOffset / SKIP_PAGE) + 1;
    api<{ items: unknown[]; total: number }>(`/api/item-batches/${batch.id}/skips?page=${page}&pageSize=${SKIP_PAGE}`)
      .then((res) => {
        if (cancelled) return;
        setSkips(res.items);
        setSkipTotal(res.total);
      })
      .catch(() => {
        if (!cancelled) setSkips([]);
      });
    return () => {
      cancelled = true;
    };
  }, [batch?.id, batch?.status, batch?.skippedRows, batch?.skippedSheets, skipOffset]);

  useEffect(() => {
    if (batch?.status === 'published') {
      if (!firedPublished.current) {
        firedPublished.current = true;
        onPublished?.();
      }
    } else {
      firedPublished.current = false;
    }
    onBatchChange?.(batch ? { id: batch.id, status: batch.status } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id, batch?.status]);

  const loadBatch = async (id: number) => {
    try {
      const b = await api<ItemBatch>(`/api/item-batches/${id}`);
      setBatch(b);
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setBatch(null);
        setBatchId(null);
      }
    }
  };

  if (!user) return null;

  if (forbidden) {
    return (
      <div className="empty-state">
        <h2>No access</h2>
        <p className="empty-copy">You don't have permission to upload item catalogs.</p>
      </div>
    );
  }

  const acceptFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    // Catch the wrong file type here rather than letting it upload and fail
    // deep inside the parser.
    if (!isSpreadsheetFilename(f.name)) {
      setFile(null);
      setError(`"${f.name}" can't be read here. Please choose an Excel workbook (.xlsx or .xls) or a CSV exported from Tally.`);
      return;
    }
    setFile(f);
    setError('');
    setUploadNote('');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      acceptFile(e.dataTransfer.files[0]);
    }
  };

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setUploadNote('');
    setPollTimeout(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api<UploadResponse>('/api/item-uploads', { method: 'POST', body: formData });
      if (res.retried) {
        setUploadNote(`This file was already uploaded as batch ${res.batchId} but got stuck or failed — restarted processing for it.`);
      } else if (res.duplicate) {
        setUploadNote(`This file was already uploaded (batch ${res.batchId}).`);
      }
      setBatchId(res.batchId);
      await loadBatch(res.batchId);
    } catch (err) {
      if (isApiError(err) && err.status === 403) {
        setForbidden(true);
      } else {
        setError(isApiError(err) ? err.message : 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  const canPublish = batch?.status === 'held';
  const canHold = user.role === 'steward' && batch?.status === 'published';

  const onPublish = async (pick: SheetPick) => {
    if (!batch || !canPublish) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<ItemBatch>(`/api/item-batches/${batch.id}/publish`, {
        method: 'POST',
        body: JSON.stringify(pick),
      });
      setBatch(next);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
      setConfirmingPublish(false);
    }
  };

  const onHold = async () => {
    if (!batch || !canHold) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<ItemBatch>(`/api/item-batches/${batch.id}/hold`, { method: 'POST' });
      setBatch(next);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Hold failed');
    } finally {
      setBusy(false);
      setConfirmingHold(false);
    }
  };

  const onRetry = async () => {
    if (!batch) return;
    setBusy(true);
    setError('');
    setPollTimeout(false);
    try {
      const next = await api<ItemBatch>(`/api/item-batches/${batch.id}/retry`, { method: 'POST' });
      setBatch(next);
      setRetryNonce((n) => n + 1);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Retry failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-flow">
      <form className="upload-form" onSubmit={(e) => void onUpload(e)}>
        <motion.div
          className={`dropzone${dragOver ? ' dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}
          whileHover={prefersReducedMotion ? { borderColor: 'var(--accent)' } : { scale: 1.01, borderColor: 'var(--accent)' }}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
          layout={!prefersReducedMotion}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div>
            <p style={{ margin: 0, fontWeight: 500, fontSize: '1.1rem' }}>
              {file ? file.name : 'Click to browse or drop an Excel file here'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
              Supports .xlsx, .xls, and .csv from Tally
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => acceptFile(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
          />
        </motion.div>

        <AnimatePresence>
          {file && (
            <motion.button
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.95 }}
              type="submit"
              className="btn btn-primary"
              disabled={uploading}
              style={{ alignSelf: 'flex-start', marginTop: '16px' }}
            >
              {uploading ? 'Uploading…' : 'Upload File'}
            </motion.button>
          )}
        </AnimatePresence>
      </form>

      {error && <p className="form-error" role="alert">{error}</p>}
      {uploadNote && <p className="upload-note">{uploadNote}</p>}

      {batch && (
        <section className="batch-card">
          <div className="batch-head">
            <h2>Batch {batch.id}</h2>
            {statusPill(batch.status)}
          </div>
          {batch.status === 'processing' && !pollTimeout && (
            <p className="muted">Reading your file… you can wait here.</p>
          )}
          {batch.status === 'processing' && pollTimeout && (
            <div className="banner banner-critical">
              <p className="banner-title">Still processing after 2 minutes</p>
              <p>This may indicate a problem. You can retry it directly below, or refresh the page to keep checking.</p>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onRetry()}>
                {busy ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}
          {(batch.status !== 'processing' || batch.totalRows > 0) && (
            <dl className="meta-grid">
              <div>
                <dt>Uploaded</dt>
                <dd>{formatAsOf(batch.uploadedAt)}</dd>
              </div>
              <div>
                <dt>Sheets</dt>
                <dd>Recognized {batch.recognizedSheets} · Skipped {batch.skippedSheets} · Total {batch.totalSheets}</dd>
              </div>
              <div>
                <dt>Rows</dt>
                <dd>Will merge {batch.acceptedRows} · Skipped {batch.skippedRows} · Total {batch.totalRows}</dd>
              </div>
            </dl>
          )}

          {batch.status !== 'processing' && batch.mergeSummary && typeof batch.mergeSummary.newCount === 'number' && (
            <div className="alias-review">
              <h3>Alias check (before merge)</h3>
              <p className="alias-review-lead">
                Alias is the primary key. The live catalog is cross-referenced on Alias so the same
                item is not added twice. Duplicate Aliases inside this file keep the last row.
              </p>
              <dl>
                <div>
                  <dt>New Aliases</dt>
                  <dd>{batch.mergeSummary.newCount.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt>Updates to existing</dt>
                  <dd>{batch.mergeSummary.updateCount.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt>Unchanged (not written)</dt>
                  <dd>{batch.mergeSummary.unchangedCount.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt>Duplicate Aliases in file</dt>
                  <dd>{batch.mergeSummary.duplicateAliasCount.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt>Matched existing Alias, different item code</dt>
                  <dd>{batch.mergeSummary.remappedByAliasCount.toLocaleString('en-IN')}</dd>
                </div>
                <div>
                  <dt>Ambiguous live Aliases (not merged)</dt>
                  <dd>{batch.mergeSummary.ambiguousAliasCount.toLocaleString('en-IN')}</dd>
                </div>
              </dl>
            </div>
          )}

          {batch.status === 'rejected' && (
            <div className="banner banner-critical">
              <p className="banner-title">We couldn't read this file</p>
              <p>{describeItemBatchError(batch.errorSummary)}</p>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onRetry()}>
                {busy ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}

          {/* Publish makes this batch's items visible to every search in the
              app at once — a wrong click here is the single most consequential
              action on this page, so it gets a plain-language confirm step
              instead of firing immediately. */}
          {canPublish && confirmingPublish && (
            <div className="banner banner-warning">
              <SheetDestination
                defaultNewName={
                  (file?.name || batch.sourceFile?.originalName || '').replace(/\.[^.]+$/, '')
                }
                confirmLabel={`Add ${batch.acceptedRows.toLocaleString('en-IN')} items`}
                busy={busy}
                onConfirm={(pick) => void onPublish(pick)}
                onCancel={() => setConfirmingPublish(false)}
              />
            </div>
          )}

          {canHold && confirmingHold && (
            <div className="banner banner-warning">
              <p className="banner-title">Take these items off everyone's search?</p>
              <p>The previous live list will come back. You can make this file live again later.</p>
              <div className="batch-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onHold()}>
                  {busy ? 'Working…' : 'Yes, take it off'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmingHold(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {batch.status !== 'processing' && !confirmingPublish && !confirmingHold && (
            <div className="batch-actions">
              {canPublish && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => setConfirmingPublish(true)}
              >
                Add items
              </button>
              )}
              {canHold && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmingHold(true)}>
                  Take off search
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {batch && batch.status !== 'processing' && skipTotal > 0 && (
        <section className="rejects">
          <h2>Rows or sheets that were skipped ({skipTotal})</h2>
          <div className="table-scroll">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Sheet</th>
                  <th>Row</th>
                  <th>What happened</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {skips.map((row, i) => (
                  <tr key={`${row.sourceRowNo}-${i}`}>
                    <td>{row.sheetName}</td>
                    <td>{row.sourceRowNo || '-'}</td>
                    <td>{row.message || describeItemSkip(row.code)}</td>
                    <td>
                      {row.raw != null && (
                        <details
                          open={expandedRaw === i}
                          onToggle={(e) => setExpandedRaw((e.target as HTMLDetailsElement).open ? i : null)}
                        >
                          <summary>Original row</summary>
                          <pre className="raw-json">{JSON.stringify(row.raw, null, 2)}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="muted">
              {skipTotal === 0 ? '0' : `${skipOffset + 1}–${Math.min(skipOffset + SKIP_PAGE, skipTotal)}`} of {skipTotal}
            </span>
            <div className="pager-btns">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={skipOffset <= 0}
                onClick={() => setSkipOffset(Math.max(0, skipOffset - SKIP_PAGE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={skipOffset + SKIP_PAGE >= skipTotal}
                onClick={() => setSkipOffset(skipOffset + SKIP_PAGE)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
