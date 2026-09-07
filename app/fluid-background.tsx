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
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const host = canvas.parentElement;
    if (!ctx || !host) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let lastW = 1;
    let lastH = 1;

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
    const particles: Particle[] = Array.from({ length: 30 }, (_, i) => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      homeX: ((i * 47) % 97) / 97,
      homeY: ((i * 71 + 13) % 101) / 101,
      radius: 2.5 + ((i * 17) % 8) * 0.75,
      phase: i * 0.83,
    }));

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (const p of particles) {
        if (p.x === 0 && p.y === 0) {
          p.x = p.homeX * width;
          p.y = p.homeY * height;
        } else {
          p.x *= width / lastW;
          p.y *= height / lastH;
        }
      }
      lastW = width;
      lastH = height;
    };

    const localPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };

    const onPointerMove = (event: PointerEvent) => {
      const next = localPointer(event);
      if (!next.inside) {
        pointer.active = false;
        return;
      }

      pointer.active = true;
      pointer.lastX = pointer.x || next.x;
      pointer.lastY = pointer.y || next.y;
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.vx = pointer.vx * 0.55 + (pointer.x - pointer.lastX) * 0.45;
      pointer.vy = pointer.vy * 0.55 + (pointer.y - pointer.lastY) * 0.45;

      if (!reducedMotion) {
        trail.push({ x: pointer.x, y: pointer.y, life: 1 });
        if (trail.length > 18) trail.shift();
      }
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      const next = localPointer(event);
      if (!next.inside || reducedMotion) return;
      ripples.push({ x: next.x, y: next.y, radius: 8, life: 1 });
      if (ripples.length > 5) ripples.shift();
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      particles.forEach((p) => {
        const x = p.homeX * width;
        const y = p.homeY * height;
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 45, 78, 0.18)';
        ctx.fill();
      });
      ctx.restore();
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // A faint watery mouse trail: several blurred red droplets that flow together.
      for (let i = trail.length - 1; i >= 0; i -= 1) {
        const t = trail[i];
        t.life *= 0.91;
        const age = 1 - t.life;
        const radius = 8 + (1 - age) * 17;
        ctx.beginPath();
        ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 35, 68, ${0.045 * t.life})`;
        ctx.shadowBlur = 24;
        ctx.shadowColor = 'rgba(255, 35, 68, .65)';
        ctx.fill();
      }
      while (trail.length && trail[0].life < 0.05) trail.shift();
      ctx.shadowBlur = 0;

      // Floating dots are softly pulled by the mouse and then return to their place.
      particles.forEach((p, i) => {
        const homeX = p.homeX * width + Math.sin(time * 0.00022 + p.phase) * 20;
        const homeY = p.homeY * height + Math.cos(time * 0.00018 + p.phase * 1.3) * 16;

        p.vx += (homeX - p.x) * 0.0016;
        p.vy += (homeY - p.y) * 0.0016;

        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const reach = 230;
          if (dist < reach) {
            const force = (1 - dist / reach) ** 2;
            p.vx += dx * 0.0032 * force + pointer.vx * 0.055 * force;
            p.vy += dy * 0.0032 * force + pointer.vy * 0.055 * force;
          }
        }

        p.vx *= 0.945;
        p.vy *= 0.945;
        p.x += p.vx;
        p.y += p.vy;

        const pulse = 0.75 + Math.sin(time * 0.0014 + p.phase) * 0.25;
        const r = p.radius * (0.9 + pulse * 0.35);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 42, 73, ${0.17 + (i % 4) * 0.025})`;
        ctx.shadowBlur = 8 + r * 1.7;
        ctx.shadowColor = 'rgba(255, 29, 64, .38)';
        ctx.fill();
      });

      // Click feedback: a quick liquid-like ring expands from the click point.
      ripples.forEach((r) => {
        r.radius += 4.2;
        r.life *= 0.92;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 63, 91, ${0.48 * r.life})`;
        ctx.lineWidth = 1.2 + r.life * 1.8;
        ctx.shadowBlur = 16;
        ctx.shadowColor = 'rgba(255, 32, 65, .55)';
        ctx.stroke();
      });
      while (ripples.length && ripples[0].life < 0.05) ripples.shift();

      ctx.restore();
      pointer.vx *= 0.86;
      pointer.vy *= 0.86;
      frame = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('mouseleave', onPointerLeave);

    if (reducedMotion) drawStatic();
    else frame = requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('mouseleave', onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="liquid-fx-canvas" aria-hidden="true" />;
}
