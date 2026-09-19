import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { fetchLiveSources } from '../lib/api.ts';
import { formatAsOf } from '../lib/format.ts';
import type { LiveSourceFile, LiveSources, PendingSourceFile } from '../lib/types.ts';

type Props = {
  /** Bump after publish/hold so the pane refetches without a page change. */
  refreshKey?: string | number | boolean;
};

function fileLabel(file: { originalName: string; batchId: number }) {
  return file.originalName.trim() || `File ${file.batchId}`;
}

function countLabel(n: number) {
  const grouped = n.toLocaleString('en-IN');
  return n === 1 ? '1 item' : `${grouped} items`;
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

export function LiveSourcePane({ refreshKey }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<LiveSources | null>(null);
  const [open, setOpen] = useState(false);

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

  const live = data.items.live;
  const pending = data.items.pending;
  const uploadHref = '/catalog/upload';
  const canOpen = true;

  if (live.length === 0 && pending.length === 0) {
    return (
      <aside className="source-pane source-pane-empty source-pane-compact" aria-label="Live file for search">
        <p className="source-pane-kicker">Search file</p>
        <p className="source-pane-title">No live item list yet</p>
      </aside>
    );
  }

  const totalRows = live.reduce((sum, f) => sum + f.liveRows, 0);
  const summary =
    live.length === 0
      ? 'No live item list yet'
      : live.length === 1
        ? `Searching this file — ${countLabel(totalRows)}`
        : `Searching ${live.length} files — ${countLabel(totalRows)}`;

  return (
    <aside className={`source-pane source-pane-compact${live.length === 0 ? ' source-pane-empty' : ''}`} aria-label="Live file for search">
      <button type="button" className="source-pane-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="source-pane-kicker">Search file</span>
        {live.length > 0 && <span className="pill pill-success">Live</span>}
        <span className="source-pane-title">{summary}</span>
        {pending.length > 0 && (
          <span className="pill pill-warning">
            {pending.length === 1 ? '1 waiting' : `${pending.length} waiting`}
          </span>
        )}
        <span className="source-pane-toggle" aria-hidden="true">{open ? 'Hide details ▲' : 'Show details ▾'}</span>
      </button>

      {open && (
        <div className="source-pane-details">
          {live.length > 0 ? (
            <ul className="source-file-list">
              {live.map((file: LiveSourceFile) => (
                <li key={file.batchId}>
                  <FileName file={file} href={uploadHref} canOpen={canOpen} />
                  <span className="source-file-meta">
                    {[countLabel(file.liveRows), file.publishedAt ? `made live ${formatAsOf(file.publishedAt)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
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
        </div>
      )}
    </aside>
  );
}
