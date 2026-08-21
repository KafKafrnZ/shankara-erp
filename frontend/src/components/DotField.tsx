import React, { useEffect, useRef } from 'react';

interface DotFieldProps {
  variant: 'light' | 'dark';
  /** RGB triplet, e.g. '227, 6, 19' (brand red, the default) or '0, 0, 0' for black dots. */
  dotColor?: string;
  /**
   * 'viewport' (default): fixed, covers the whole screen — used behind the
   * app shell / login. 'container': absolute, fills whatever positioned
   * ancestor it's placed in — used for a single half of a split panel,
   * where each half needs its own independent dot field, not one field
   * shared across the whole viewport.
   */
  fill?: 'viewport' | 'container';
}

export const DotField: React.FC<DotFieldProps> = ({ variant, dotColor = '227, 6, 19', fill = 'viewport' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SPACING = 34;
    const BASE_RADIUS = 1.5;
    const REACTIVE_RADIUS = 160;
    const MAX_SCALE = 2.5;
    const MAX_OPACITY = 0.55;

    const BASE_OPACITY = variant === 'dark' ? 0.14 : 0.08;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;

    let pointerX = -1000;
    let pointerY = -1000;
    let animFrame: number;

    const resize = () => {
      // Measure the canvas's own rendered box, not the window — this is
      // what makes the same component work both as a full-viewport field
      // (fill="viewport", sized by CSS to 100vw/100vh) and as one half of
      // a split panel (fill="container", sized by its parent).
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      columns = Math.ceil(width / SPACING) + 1;
      rows = Math.ceil(height / SPACING) + 1;

      if (prefersReducedMotion) {
        draw(true);
      }
    };

    let resizeTimer: any;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    };

    const draw = (staticOnly = false) => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * SPACING;
          const y = j * SPACING;

          let r = BASE_RADIUS;
          let alpha = BASE_OPACITY;

          if (!staticOnly) {
            const dx = x - pointerX;
            const dy = y - pointerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < REACTIVE_RADIUS) {
              const t = Math.max(0, 1 - dist / REACTIVE_RADIUS);
              const factor = t * t * (3 - 2 * t); // smoothstep
              r += (MAX_SCALE * BASE_RADIUS - BASE_RADIUS) * factor;
              alpha += (MAX_OPACITY - BASE_OPACITY) * factor;
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${dotColor}, ${alpha})`;
          ctx.fill();
        }
      }

      if (!staticOnly && !prefersReducedMotion) {
        animFrame = requestAnimationFrame(() => draw());
      }
    };

    // Only react to the pointer over plain background — never over anything
    // clickable or typeable. The canvas already can't intercept clicks
    // (pointer-events: none), but the reactive glow itself shouldn't
    // compete for attention with a button or input the user is actually
    // about to use; it should read as ambient texture, not something
    // "responding" to your hover on real controls.
    //
    // Deliberately NOT [role="button"]: large custom-button containers
    // (e.g. the chooser panels) carry that role for accessibility while
    // wanting the glow to react across their whole background — only the
    // specific small controls inside opt out, via .dot-suppress.
    const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, tr.clickable, label, .dot-suppress';
    const onPointerMove = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest(INTERACTIVE_SELECTOR)) {
        pointerX = -1000;
        pointerY = -1000;
        return;
      }
      // Coordinates relative to this canvas's own box, not the window —
      // required for the "container" fill mode (a canvas that only covers
      // half the screen) to react to the pointer at the right position.
      const rect = canvas.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
    };

    window.addEventListener('resize', onResize);

    if (!prefersReducedMotion) {
      window.addEventListener('mousemove', onPointerMove);
    }

    resize();
    if (!prefersReducedMotion) {
      draw();
    }

    return () => {
      window.removeEventListener('resize', onResize);
      if (!prefersReducedMotion) {
        window.removeEventListener('mousemove', onPointerMove);
        cancelAnimationFrame(animFrame);
      }
    };
  }, [variant, dotColor, fill]);

  return (
    <canvas
      ref={canvasRef}
      style={
        fill === 'viewport'
          ? { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', width: '100vw', height: '100vh' }
          : { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', width: '100%', height: '100%' }
      }
    />
  );
};
