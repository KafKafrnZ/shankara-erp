import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, isApiError } from '../lib/api.ts';
import { describeItemSkip } from '../lib/item-skip-codes.ts';
import { formatAsOf } from '../lib/format.ts';
import { useAuth } from '../auth/useAuth.ts';

interface UploadResponse {
  batchId: number;
  status: string;
  duplicate: boolean;
  retried?: boolean;
  sha256: string;
  originalName: string;
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
}

const ACCEPT = '.csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/zip';

function statusPill(status: string) {
  switch (status) {
    case 'processing': return <span className="pill pill-info">Processing</span>;
    case 'held': return <span className="pill pill-warning">Held</span>;
    case 'published': return <span className="pill pill-success">Published</span>;
    case 'rejected': return <span className="pill pill-critical">Rejected</span>;
    default: return <span className="pill">{status}</span>;
  }
}

export function CatalogUploadPage() {
  const [searchParams, setParams] = useSearchParams();
  const batchIdParam = searchParams.get('batch');

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

  const [batch, setBatch] = useState<ItemBatch | null>(null);
  const [skips, setSkips] = useState<any[]>([]);
  const [skipTotal, setSkipTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null);
  const [pollTimeout, setPollTimeout] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const { user } = useAuth();

  useEffect(() => {
    if (!batchIdParam) {
      setBatch(null);
      setPollTimeout(false);
      return;
    }
    loadBatch(Number(batchIdParam));
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

  const loadBatch = async (id: number) => {
    try {
      const b = await api<ItemBatch>(`/api/item-batches/${id}`);
      setBatch(b);
      if (b.status === 'held' || b.status === 'published' || b.status === 'rejected') {
        if (b.skippedRows > 0 || b.skippedSheets > 0) {
          const res = await api<{ data: any[]; total: number }>(`/api/item-batches/${id}/skips`);
          setSkips(res.data);
          setSkipTotal(res.total);
        } else {
          setSkips([]);
          setSkipTotal(0);
        }
      }
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setBatch(null);
        setParams({});
      }
    }
  };

  if (!user) return null;

  if (user.role !== 'steward' || forbidden) {
    return (
      <div className="empty-state">
        <h2>No access</h2>
        <p className="empty-copy">Only stewards can upload item catalogs.</p>
      </div>
    );
  }

  const acceptFile = (f: File | null) => {
    if (!f) {
      setFile(null);
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

  const onUpload = async (e: React.FormEvent) => {
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
      setParams({ batch: String(res.batchId) });
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
  const canHold = batch?.status === 'published';

  const onPublish = async () => {
    if (!batch || !canPublish) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<ItemBatch>(`/api/item-batches/${batch.id}/publish`, { method: 'POST' });
      setBatch(next);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
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
    <div className="upload-page">
      <h1 className="page-title">Catalog Upload</h1>
      <p className="muted page-lead">Item Master / Catalog export (.xlsx).</p>

      <form className="upload-form" onSubmit={(e) => void onUpload(e)}>
        <div
          className={`dropzone${dragOver ? ' dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p>{file ? file.name : 'Drop a file here, or choose one'}</p>
          <input
            type="file"
            accept={ACCEPT}
            onChange={(e) => acceptFile(e.target.files?.[0] || null)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!file || uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
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
            <p className="muted">Processing your file...</p>
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
          {batch.status !== 'processing' && (
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
                <dd>Accepted {batch.acceptedRows} · Skipped {batch.skippedRows} · Total {batch.totalRows}</dd>
              </div>
            </dl>
          )}

          {batch.status === 'rejected' && (
            <div className="banner banner-critical">
              <p className="banner-title">File rejected</p>
              {batch.errorSummary && <p>{batch.errorSummary}</p>}
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onRetry()}>
                {busy ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}

          {batch.status !== 'processing' && (
            <div className="batch-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canPublish || busy}
                onClick={() => void onPublish()}
              >
                Publish
              </button>
              {canHold && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onHold()}>
                  Hold
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {batch && batch.status !== 'processing' && skips.length > 0 && (
        <section className="rejects">
          <h2>Rows or sheets that were skipped ({skipTotal})</h2>
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
                  <td>{describeItemSkip(row.code)}</td>
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
        </section>
      )}
    </div>
  );
}
