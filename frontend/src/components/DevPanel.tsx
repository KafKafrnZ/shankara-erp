import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth.ts';
import { getDevLog, subscribeDevLog } from '../lib/devlog.ts';
import type { DevLogEntry } from '../lib/devlog.ts';

type HealthStatus = 'checking' | 'ok' | 'error';

type Health = {
  status: HealthStatus;
  db?: string;
  ms?: number;
  checkedAt?: number;
};

const POLL_MS = 20_000;

function timeLabel(at: number) {
  return new Date(at).toLocaleTimeString('en-IN', { hour12: false });
}

// Steward-only, deliberately small and out of the way — this is a tool for
// whoever is at the keyboard fixing something, not part of the product
// anyone else needs to understand. Kept visually distinct (dark, monospace)
// on purpose: it should read as "developer tool", not as part of the app.
export function DevPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health>({ status: 'checking' });
  const [log, setLog] = useState<DevLogEntry[]>(() => getDevLog());
  const isSteward = user?.role === 'steward';

  useEffect(() => subscribeDevLog(() => setLog(getDevLog())), []);

  useEffect(() => {
    if (!isSteward) return;
    let cancelled = false;
    const check = async () => {
      const startedAt = performance.now();
      try {
        const res = await fetch('/api/health');
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        setHealth({
          status: res.ok ? 'ok' : 'error',
          db: body?.db,
          ms: Math.round(performance.now() - startedAt),
          checkedAt: Date.now(),
        });
      } catch {
        if (cancelled) return;
        setHealth({ status: 'error', ms: Math.round(performance.now() - startedAt), checkedAt: Date.now() });
      }
    };
    void check();
    const t = window.setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isSteward]);

  if (!isSteward) return null;

  const healthWord = health.status === 'ok' ? 'healthy' : health.status === 'checking' ? 'checking…' : 'unreachable';

  return (
    <div className="dev-panel">
      <button
        type="button"
        className="dev-panel-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Developer panel"
      >
        <span className={`dev-panel-dot dev-panel-dot-${health.status}`} aria-hidden="true" />
        Dev
      </button>

      {open && (
        <div className="dev-panel-body">
          <div className="dev-panel-section">
            <div className="dev-panel-row">
              <span className={`dev-panel-dot dev-panel-dot-${health.status}`} aria-hidden="true" />
              <span>backend: {healthWord}</span>
            </div>
            <div className="dev-panel-row">
              <span className="dev-panel-dot dev-panel-dot-ok" aria-hidden="true" />
              <span>frontend: running</span>
            </div>
            {health.checkedAt && (
              <div className="dev-panel-meta">
                {health.ms != null && <span>{health.ms}ms</span>}
                {health.db && <span>db:{health.db}</span>}
                <span>checked {timeLabel(health.checkedAt)}</span>
              </div>
            )}
          </div>

          <div className="dev-panel-log">
            {log.length === 0 && <p className="dev-panel-empty">no requests logged yet</p>}
            {log.map((entry) => (
              <div key={entry.id} className={`dev-panel-log-row${entry.ok ? '' : ' is-error'}`}>
                <span className="dev-panel-log-status">{entry.status ?? 'ERR'}</span>
                <span className="dev-panel-log-method">{entry.method}</span>
                <span className="dev-panel-log-path" title={entry.path}>{entry.path}</span>
                <span className="dev-panel-log-ms">{entry.ms}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
