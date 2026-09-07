'use client';

import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  radius: number;
  phase: number;
};

type TrailPoint = { x: number; y: number; life: number };
type Ripple = { x: number; y: number; radius: number; life: number };

export default function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !host || !ctx) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const staticMode = prefersReduced || coarsePointer;

    let raf = 0;
    let width = 1;
    let height = 1;
    let lastW = 1;
    let lastH = 1;
    let rect = host.getBoundingClientRect();
    let lastFrame = 0;
    let running = false;

    const particleCount = width < 800 ? 9 : 14;
    const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      homeX: ((i * 47) % 97) / 97,
      homeY: ((i * 71 + 13) % 101) / 101,
      radius: 2.2 + ((i * 17) % 5) * 0.7,
      phase: i * 0.83,
    }));

    const pointer = {
      x: 0,
      y: 0,
      lastX: 0,
      lastY: 0,
      vx: 0,
      vy: 0,
      active: false,
    };

    const trail: TrailPoint[] = [];
    const ripples: Ripple[] = [];

    const resize = () => {
      rect = host.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));

      // 1x DPR keeps the full-page canvas much cheaper to redraw.
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      for (const p of particles) {
        if (p.x === 0 && p.y === 0) {
          p.x = p.homeX * width;
          p.y = p.homeY * height;
        } else {
          p.x *= width / Math.max(lastW, 1);
          p.y *= height / Math.max(lastH, 1);
        }
      }

      lastW = width;
      lastH = height;
    };

    const localPointer = (event: PointerEvent) => {
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (staticMode) return;
      const next = localPointer(event);
      if (!next.inside) {
        pointer.active = false;
        return;
      }

      const previousX = pointer.active ? pointer.x : next.x;
      const previousY = pointer.active ? pointer.y : next.y;
      pointer.active = true;
      pointer.lastX = previousX;
      pointer.lastY = previousY;
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.vx = pointer.vx * 0.65 + (pointer.x - pointer.lastX) * 0.35;
      pointer.vy = pointer.vy * 0.65 + (pointer.y - pointer.lastY) * 0.35;

      const dx = pointer.x - pointer.lastX;
      const dy = pointer.y - pointer.lastY;
      if (dx * dx + dy * dy > 36) {
        trail.push({ x: pointer.x, y: pointer.y, life: 1 });
        if (trail.length > 7) trail.shift();
      }
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (staticMode) return;
      const next = localPointer(event);
      if (!next.inside) return;
      ripples.push({ x: next.x, y: next.y, radius: 7, life: 1 });
      if (ripples.length > 3) ripples.shift();
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.homeX * width, p.homeY * height, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 55, 82, 0.20)';
        ctx.fill();
      }
    };

    const drawTrail = () => {
      if (trail.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i += 1) {
        const prev = trail[i - 1];
        const curr = trail[i];
        const mx = (prev.x + curr.x) * 0.5;
        const my = (prev.y + curr.y) * 0.5;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      ctx.strokeStyle = 'rgba(255, 45, 75, 0.10)';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 70, 95, 0.16)';
      ctx.lineWidth = 5;
      ctx.stroke();
    };

    const draw = (time: number) => {
      if (!running) return;
      raf = requestAnimationFrame(draw);

      // Cap visual effect at ~30 FPS. The call/audio UI stays unaffected.
      if (time - lastFrame < 33) return;
      lastFrame = time;

      ctx.clearRect(0, 0, width, height);

      for (let i = trail.length - 1; i >= 0; i -= 1) {
        trail[i].life *= 0.84;
      }
      while (trail.length && trail[0].life < 0.08) trail.shift();
      drawTrail();

      for (const p of particles) {
        const homeX = p.homeX * width + Math.sin(time * 0.00018 + p.phase) * 11;
        const homeY = p.homeY * height + Math.cos(time * 0.00015 + p.phase * 1.3) * 9;

        p.vx += (homeX - p.x) * 0.0018;
        p.vy += (homeY - p.y) * 0.0018;

        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const distSq = dx * dx + dy * dy;
          const reach = 180;
          if (distSq < reach * reach) {
            const dist = Math.sqrt(distSq) || 1;
            const force = 1 - dist / reach;
            p.vx += dx * 0.0022 * force + pointer.vx * 0.025 * force;
            p.vy += dy * 0.0022 * force + pointer.vy * 0.025 * force;
          }
        }

        p.vx *= 0.92;
        p.vy *= 0.92;
        p.x += p.vx;
        p.y += p.vy;

        const pulse = 0.92 + Math.sin(time * 0.001 + p.phase) * 0.08;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 48, 76, 0.24)';
        ctx.fill();
      }

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const r = ripples[i];
        r.radius += 5;
        r.life *= 0.82;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 65, 92, ${0.34 * r.life})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (r.life < 0.06) ripples.splice(i, 1);
      }

      pointer.vx *= 0.75;
      pointer.vy *= 0.75;
    };

    const start = () => {
      if (staticMode || running || document.hidden) return;
      running = true;
      lastFrame = 0;
      raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    host.addEventListener('pointermove', onPointerMove, { passive: true });
    host.addEventListener('pointerleave', onPointerLeave, { passive: true });
    host.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (staticMode) drawStatic();
    else start();

    return () => {
      stop();
      observer.disconnect();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="liquid-fx-canvas" aria-hidden="true" />;
}
