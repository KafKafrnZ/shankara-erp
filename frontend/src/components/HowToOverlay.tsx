import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAuth } from '../auth/useAuth.ts';
import { HOWTO_CARDS } from '../lib/howto.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { DotField } from './DotField.tsx';

type Props = {
  open: boolean;
  onClose: () => void;
};

function slotFor(i: number, index: number) {
  if (i === index) return 'is-current';
  if (i === index - 1) return 'is-prev';
  if (i === index + 1) return 'is-next';
  return i < index ? 'is-off-left' : 'is-off-right';
}

export function HowToOverlay({ open, onClose }: Props) {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const cards = useMemo(
    () => HOWTO_CARDS.filter((card) => !card.stewardOnly || user?.role === 'steward'),
    [user?.role],
  );
  const last = cards.length - 1;
  const current = cards[index] ?? cards[0];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => nextRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !user || !current) return null;

  const go = (nextIndex: number) => {
    setIndex(Math.max(0, Math.min(last, nextIndex)));
  };

  const onDialogKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (index < last) go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (index > 0) go(index - 1);
    } else if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const primaryLabel = index === last ? 'Start working' : 'Next';

  return (
    <div
      className="howto-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-title"
      ref={dialogRef}
      onKeyDown={onDialogKey}
    >
      <DotField variant="dark" />
      <div className="howto-shell">
        <header className="howto-brand">
          <BrandLogo height={36} />
          <p className="howto-brand-kicker">How to use this desk</p>
        </header>

        <div className="howto-stage" aria-live="polite">
          {cards.map((card, i) => (
            <article
              key={card.id}
              className={`howto-card howto-card-${card.theme} ${slotFor(i, index)}`}
              aria-hidden={i !== index}
            >
              <span className="howto-card-index">
                {i + 1} / {cards.length}
              </span>
              <p className="howto-card-kicker">{card.kicker}</p>
              <h2 className="howto-card-title" id={i === index ? 'howto-title' : undefined}>
                {card.title}
              </h2>
              {card.body.map((para) => (
                <p key={para} className="howto-card-body">{para}</p>
              ))}
            </article>
          ))}
        </div>

        <div className="howto-chrome">
          <div className="howto-pips" role="tablist" aria-label="Instruction cards">
            {cards.map((card, i) => (
              <button
                key={card.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Card ${i + 1}: ${card.title}`}
                className={`howto-pip${i === index ? ' is-active' : ''}${card.theme === 'red' ? ' is-red' : ''}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="howto-actions">
            <button
              type="button"
              className="howto-btn howto-btn-ghost"
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              Back
            </button>
            <button
              ref={nextRef}
              type="button"
              className="howto-btn howto-btn-primary"
              onClick={() => {
                if (index === last) onClose();
                else go(index + 1);
              }}
            >
              {primaryLabel}
            </button>
          </div>
          <button type="button" className="howto-skip" onClick={onClose}>
            Skip — I already know this
          </button>
        </div>
      </div>
    </div>
  );
}
