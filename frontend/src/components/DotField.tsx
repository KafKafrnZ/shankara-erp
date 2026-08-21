import React, { useEffect, useRef } from 'react';

interface DotFieldProps {
  variant: 'light' | 'dark';
}

export const DotField: React.FC<DotFieldProps> = ({ variant }) => {
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
    
    // Read brand red or fallback
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
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
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
          // Set color with alpha
          ctx.fillStyle = `rgba(227, 6, 19, ${alpha})`;
          ctx.fill();
        }
      }

      if (!staticOnly && !prefersReducedMotion) {
        animFrame = requestAnimationFrame(() => draw());
      }
    };

    const onPointerMove = (e: MouseEvent) => {
      pointerX = e.clientX;
      pointerY = e.clientY;
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
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
};
