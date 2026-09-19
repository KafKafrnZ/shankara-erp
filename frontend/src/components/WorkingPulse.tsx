import { useEffect, useState } from 'react';

type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** False = settled sheet (empty states). Default true = looping wait. */
  busy?: boolean;
  /** Epoch ms the current work started. Adds a moving bar + elapsed clock
   *  under the label, so a long read reads as alive rather than wedged. */
  since?: number;
};

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** Line-drawn catalog sheet + the red Shankara skyline, same assemble-and-
 *  settle language as the game-console Lottie — no Lottie player. */
export function WorkingPulse({ label, size = 'md', busy = true, since }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (since === undefined) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);

  return (
    <div
      className={`working-pulse working-pulse-${size}${busy ? '' : ' is-idle'}`}
      role="status"
      aria-live={busy ? 'polite' : undefined}
      aria-busy={busy || undefined}
    >
      <svg
        className="working-pulse-scene"
        viewBox="0 0 160 100"
        fill="none"
        aria-hidden="true"
      >
        <rect className="wp-shadow" x="44" y="90" width="72" height="4" rx="2" />
        <rect className="wp-sheet" x="38" y="10" width="84" height="78" rx="7" />
        <path className="wp-header" d="M38 17c0-3.9 3.1-7 7-7h70c3.9 0 7 3.1 7 7v10H38V17z" />
        <g className="wp-rows">
          <line x1="50" y1="48" x2="110" y2="48" />
          <line x1="50" y1="58" x2="102" y2="58" />
          <line x1="50" y1="68" x2="110" y2="68" />
          <line x1="50" y1="78" x2="94" y2="78" />
        </g>
        <rect className="wp-scan" x="46" y="34" width="68" height="4" rx="2" />
        <g className="wp-mark" transform="translate(98 13)">
          <path d="M1 14h4.2v12H1zM6.4 7h4.2v19H6.4zM11.8 11h4.2v15h-4.2z" />
          <path d="M8.5 3.2l4 4.8H4.5z" />
        </g>
      </svg>
      {label || since !== undefined ? (
        <div className="working-pulse-body">
          {label ? <span className="working-pulse-label">{label}</span> : null}
          {since !== undefined ? (
            <div className="working-pulse-progress">
              <div className="working-pulse-track">
                <div className="working-pulse-fill" />
              </div>
              <span className="working-pulse-elapsed">
                {formatElapsed(now - since)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
