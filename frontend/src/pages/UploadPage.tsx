import { useCallback, useEffect, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { Money } from '../components/Money.tsx';
import {
  fetchBatch,
  fetchBatchRejects,
  fetchCompanies,
  holdBatch,
  isApiError,
  publishBatch,
  uploadFile,
} from '../lib/api.ts';
import { formatDisplayDiff, formatINR, isOutOfBalance } from '../lib/format.ts';
import { rejectPlainLanguage, uploadErrorPlain } from '../lib/reject-codes.ts';
import type { Batch, RejectRow, UploadResult } from '../lib/types.ts';

const ACCEPT = '.csv,.xlsx,.xls,.zip';

function statusPill(status: Batch['status'] | UploadResult['status']) {
  if (status === 'published') return <span className="pill pill-success">Published</span>;
  if (status === 'rejected') return <span className="pill pill-critical">Rejected</span>;
  if (status === 'duplicate') return <span className="pill pill-info">Duplicate</span>;
  return <span className="pill pill-warning">Held</span>;
}

export function UploadPage() {
  const { user, refreshAsOf } = useAuth();
  const [params, setParams] = useSearchParams();
  const batchParam = params.get('batch');
  const batchIdFromUrl = batchParam && /^\d+$/.test(batchParam) ? Number(batchParam) : null;

  const [companyId, setCompanyId] = useState('SHANKARA_HYD');
  const [companies, setCompanies] = useState<string[]>(['SHANKARA_HYD']);
  const [branchId, setBranchId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [rejects, setRejects] = useState<RejectRow[]>([]);
  const [rejectTotal, setRejectTotal] = useState(0);
  const [rejectPage, setRejectPage] = useState(1);
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const loadBatch = useCallback(async (id: number, page = 1) => {
    const next = await fetchBatch(id);
    setBatch(next);
    if (next.rejectedRows > 0) {
      const rr = await fetchBatchRejects(id, page, 50);
      setRejects(rr.items);
      setRejectTotal(rr.total);
      setRejectPage(page);
    } else {
      setRejects([]);
      setRejectTotal(0);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'steward') return;
    let cancelled = false;
    fetchCompanies()
      .then((res) => {
        if (!cancelled && res.items.length > 0) setCompanies(res.items);
      })
      .catch(() => {
        /* keep SHANKARA_HYD fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== 'steward' || !batchIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        await loadBatch(batchIdFromUrl);
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && err.status === 403) setForbidden(true);
        else setError(isApiError(err) ? err.message : 'Could not load batch');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchIdFromUrl, user?.role, loadBatch]);

  if (!user) return null;

  if (user.role !== 'steward' || forbidden) {
    return (
      <div className="empty-state">
        <h1>You don't have access to this</h1>
        <p className="empty-copy">Upload and publish are limited to stewards.</p>
        <Link to="/" className="btn btn-secondary">Back to search</Link>
      </div>
    );
  }

  const acceptFile = (next: File | undefined | null) => {
    if (!next) return;
    const lower = next.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xls') && !lower.endsWith('.xlsx') && !lower.endsWith('.zip')) {
      setError('Accept .xlsx, .xls, .csv, .zip only');
      return;
    }
    setError('');
    setFile(next);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError('');
    setUploadNote('');
    setBatch(null);
    try {
      const res = await uploadFile(file, companyId.trim(), branchId.trim() || undefined);
      if (res.duplicate) {
        setUploadNote(`This file was already uploaded (batch ${res.batchId}).`);
      } else if (res.status === 'rejected') {
        setUploadNote(uploadErrorPlain(res.errorSummary));
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

  const oob = batch ? isOutOfBalance(batch.errorSummary) : false;
  const canPublish = batch?.status === 'held' && !oob;
  const canHold = batch?.status === 'published';

  const onPublish = async () => {
    if (!batch || !canPublish) return;
    setBusy(true);
    setError('');
    try {
      const next = await publishBatch(batch.id);
      setBatch(next);
      await refreshAsOf();
    } catch (err) {
      if (isApiError(err) && err.message === 'OUT_OF_BALANCE') {
        setError('Publish is blocked because this batch is out of balance. Fix the source file and re-upload.');
      } else {
        setError(isApiError(err) ? err.message : 'Publish failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const onHold = async () => {
    if (!batch || !canHold) return;
    setBusy(true);
    setError('');
    try {
      const next = await holdBatch(batch.id);
      setBatch(next);
      await refreshAsOf();
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Hold failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-page">
      <h1 className="page-title">Upload</h1>
      <p className="muted page-lead">Day Book or Sales Register export (.csv, .xlsx, .xls, .zip).</p>

      <form className="upload-form" onSubmit={(e) => void onUpload(e)}>
        <label className="field">
          <span>Company ID</span>
          <input
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            list="company-ids"
            required
          />
          <datalist id="company-ids">
            {companies.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Branch ID (optional)</span>
          <input value={branchId} onChange={(e) => setBranchId(e.target.value)} />
        </label>
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
        <button type="submit" className="btn btn-primary" disabled={!file || uploading || !companyId.trim()}>
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
          <dl className="meta-grid">
            <div>
              <dt>Company</dt>
              <dd>{batch.companyId}</dd>
            </div>
            <div>
              <dt>Tally company</dt>
              <dd>{batch.tallyCompany}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{batch.periodFrom || '—'} → {batch.periodTo || '—'}</dd>
            </div>
            <div>
              <dt>Rows</dt>
              <dd>Accepted {batch.acceptedRows} · rejected {batch.rejectedRows} · total {batch.totalRows}</dd>
            </div>
            <div>
              <dt>Debit</dt>
              <dd><Money value={batch.debitSum} /></dd>
            </div>
            <div>
              <dt>Credit</dt>
              <dd><Money value={batch.creditSum} /></dd>
            </div>
          </dl>

          {oob && (
            <div className="banner banner-critical">
              <p className="banner-title">Publish blocked — out of balance</p>
              <p>
                Debits {formatINR(batch.debitSum)} do not equal credits {formatINR(batch.creditSum)}.
                Difference {formatDisplayDiff(batch.debitSum, batch.creditSum)}.
              </p>
              <p>
                Fix the source file and re-upload. There is no force-publish. The server will refuse publish on this batch.
              </p>
            </div>
          )}

          {batch.status === 'rejected' && batch.errorSummary && !oob && (
            <div className="banner banner-critical">
              <p className="banner-title">File rejected</p>
              <p>{uploadErrorPlain(batch.errorSummary)}</p>
            </div>
          )}

          <div className="batch-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canPublish || busy}
              title={oob ? 'Out of balance — publish is blocked' : undefined}
              onClick={() => void onPublish()}
            >
              Publish
            </button>
            {canHold && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void onHold()}>
                Hold
              </button>
            )}
            {oob && <span className="pill pill-critical">Publish blocked</span>}
          </div>
        </section>
      )}

      {batch && rejectTotal > 0 && (
        <section className="rejects">
          <h2>Rows that could not be read ({rejectTotal})</h2>
          <p className="muted">These do not by themselves block publish. Only an out-of-balance batch does.</p>
          <table className="results-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>What happened</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rejects.map((row, i) => (
                <tr key={`${row.sourceRowNo}-${i}`}>
                  <td>{row.sourceRowNo}</td>
                  <td>{rejectPlainLanguage(row.code, row.message)}</td>
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
          {rejectTotal > 50 && (
            <div className="pager">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={rejectPage <= 1}
                onClick={() => void loadBatch(batch.id, rejectPage - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={rejectPage * 50 >= rejectTotal}
                onClick={() => void loadBatch(batch.id, rejectPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
