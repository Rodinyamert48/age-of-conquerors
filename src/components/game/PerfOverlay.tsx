'use client';
import { useEffect, useState } from 'react';
import { useGame } from '@/store/game';
import { perf } from '@/lib/perf';
import { GAME_VERSION } from '@/lib/version';

/** F3: kare süresi, harita çizim süresi, tur süresi ve durum boyutu */
export default function PerfOverlay() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, worstMs: 0, drawMs: 0, baseMs: 0, draws: 0, heap: 0 });
  const turnMs = useGame((s) => s.turnMs);
  const state = useGame((s) => s.state);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let sum = 0;
    let worst = 0;
    let lastReport = last;
    let lastDraws = perf.draws;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      frames++;
      sum += dt;
      if (dt > worst) worst = dt;
      if (now - lastReport >= 500) {
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        setStats({ fps: Math.round((frames * 1000) / sum), frameMs: sum / frames, worstMs: worst, drawMs: perf.drawMs, baseMs: perf.baseMs, draws: perf.draws - lastDraws, heap: mem ? mem.usedJSHeapSize / 1048576 : 0 });
        frames = 0;
        sum = 0;
        worst = 0;
        lastReport = now;
        lastDraws = perf.draws;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  if (!open || !state) return null;
  const rows: [string, string][] = [
    ['FPS', `${stats.fps}`],
    ['Kare (ort / en kötü)', `${stats.frameMs.toFixed(1)} / ${stats.worstMs.toFixed(0)} ms`],
    ['Harita çizimi', `${stats.drawMs.toFixed(1)} ms (${stats.draws}/0,5 sn)`],
    ['Taban katmanı', `${stats.baseMs.toFixed(1)} ms`],
    ['Tur hesabı', `${turnMs.toFixed(0)} ms`],
    ['Ordular', `${Object.keys(state.armies).length}`],
    ['Ülkeler', `${Object.values(state.countries).filter((c) => c.alive).length}`],
    ['Bölgeler', `${state.provinces.length}`],
    ...(stats.heap ? ([['Bellek', `${stats.heap.toFixed(0)} MB`]] as [string, string][]) : []),
    ['Sürüm', GAME_VERSION],
  ];
  return (
    <div className="pointer-events-none absolute left-14 top-2 z-40 rounded border border-line-2 bg-black/80 px-2.5 py-1.5 font-mono text-[11px] leading-5 text-ink-2" data-testid="perf-overlay">
      <div className="text-gold">F3 — Performans</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-muted">{k}</span>
          <span className="tabular">{v}</span>
        </div>
      ))}
    </div>
  );
}
