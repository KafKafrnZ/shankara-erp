import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { fetchLiveSources } from '../lib/api.ts';
import { formatAsOf, formatDate } from '../lib/format.ts';
import type { LiveSourceFile, LiveSources, PendingSourceFile } from '../lib/types.ts';

type Kind = 'items' | 'vouchers';

type Props = {
  kind: Kind;
  /** Bump after publish/hold so the pane refetches without a page change. */
  refreshKey?: string | number | boolean;
};

function fileLabel(file: { originalName: string; batchId: number }) {
  return file.originalName.trim() || `File ${file.batchId}`;
}

function countLabel(kind: Kind, n: number) {
  const grouped = n.toLocaleString('en-IN');
  if (kind === 'items') return n === 1 ? '1 item' : `${grouped} items`;
  return n === 1 ? '1 bill' : `${grouped} bills`;
}

function periodLabel(file: LiveSourceFile) {
  if (!file.periodFrom && !file.periodTo) return null;
  if (file.periodFrom && file.periodTo) return `${formatDate(file.periodFrom)} to ${formatDate(file.periodTo)}`;
  return formatDate(file.periodFrom || file.periodTo || '');
}

function FileName({
  file,
  href,
  canOpen,
}: {
  file: { originalName: string; batchId: number };
  href: string;
  canOpen: boolean;
}) {
  const name = fileLabel(file);
  if (!canOpen) return <span className="source-file-name">{name}</span>;
  return (
    <Link className="source-file-name source-file-link" to={`${href}?batch=${file.batchId}`}>
      {name}
    </Link>
  );
}

export function LiveSourcePane({ kind, refreshKey }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<LiveSources | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLiveSources()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!user || !data) return null;

  const group = kind === 'items' ? data.items : data.vouchers;
  const live = group.live;
  const pending = user.role === 'steward' ? group.pending : [];
  const uploadHref = kind === 'items' ? '/catalog/upload' : '/upload';
  const canOpen = user.role === 'steward';
  const noun = kind === 'items' ? 'item list' : 'day book';

  if (live.length === 0 && pending.length === 0) {
    return (
      <aside className="source-pane source-pane-empty" aria-label="Live file for search">
        <p className="source-pane-kicker">Search file</p>
        <p className="source-pane-title">No live {noun} yet</p>
        <p className="source-pane-copy">Search stays empty until someone uploads a file and clicks Make live.</p>
      </aside>
    );
  }

  const heading =
    live.length === 0
      ? `No live ${noun} yet`
      : live.length === 1
        ? 'Searching this file'
        : `Searching these ${live.length} files`;

  return (
    <aside className={`source-pane${live.length === 0 ? ' source-pane-empty' : ''}`} aria-label="Live file for search">
      <div className="source-pane-head">
        <p className="source-pane-kicker">Search file</p>
        {live.length > 0 && <span className="pill pill-success">Live</span>}
      </div>
      <p className="source-pane-title">{heading}</p>
      {live.length > 0 && (
        <ul className="source-file-list">
          {live.map((file) => {
            const period = periodLabel(file);
            const bits = [
              countLabel(kind, file.liveRows),
              period,
              file.companyId && kind === 'vouchers' ? file.companyId : null,
              file.publishedAt ? `made live ${formatAsOf(file.publishedAt)}` : null,
            ].filter(Boolean);
            return (
              <li key={file.batchId}>
                <FileName file={file} href={uploadHref} canOpen={canOpen} />
                <span className="source-file-meta">{bits.join(' · ')}</span>
              </li>
            );
          })}
        </ul>
      )}
      {live.length === 0 && (
        <p className="source-pane-copy">Uploaded files are not on search until someone clicks Make live.</p>
      )}
      {pending.length > 0 && (
        <div className="source-pending">
          <p className="source-pending-title">
            {pending.length === 1
              ? '1 file uploaded, not on search yet'
              : `${pending.length} files uploaded, not on search yet`}
          </p>
          <ul className="source-file-list source-file-list-pending">
            {pending.map((file: PendingSourceFile) => (
              <li key={file.batchId}>
                <FileName file={file} href={uploadHref} canOpen={canOpen} />
                <span className="source-file-meta">
                  {file.status === 'processing' ? 'Reading the file…' : 'Waiting to make live'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
