type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** False = settled sheet (empty states). Default true = looping wait. */
  busy?: boolean;
};

/** Line-drawn catalog sheet + the red Shankara skyline, same assemble-and-
 *  settle language as the game-console Lottie — no Lottie player. */
export function WorkingPulse({ label, size = 'md', busy = true }: Props) {
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
      {label ? <span className="working-pulse-label">{label}</span> : null}
    </div>
  );
}
