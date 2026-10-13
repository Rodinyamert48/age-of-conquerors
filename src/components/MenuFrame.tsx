'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useGame } from '@/store/game';
import { buildGeometry, countryBorders } from './map/geometry';
import { useT } from '@/i18n';

/** Menü arka planı: koyu tonlarda dünya haritası */
export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const geo = useGame((s) => s.geo);
  const world = useGame((s) => s.world);
  useEffect(() => {
    useGame
      .getState()
      .init()
      .catch(() => {});
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !geo || !world) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const g = buildGeometry(geo);
      const k = Math.max(w / g.width, h / g.height) * 1.15;
      const ox = (w - g.width * k) / 2 - w * 0.08;
      const oy = (h - g.height * k) / 2 + h * 0.05;
      ctx.setTransform(dpr * k, 0, 0, dpr * k, ox * dpr, oy * dpr);
      ctx.fillStyle = '#0c1524';
      ctx.fillRect(-g.width, -g.height, g.width * 3, g.height * 3);
      const land = new Path2D();
      for (const p of g.provincePaths) land.addPath(p);
      ctx.fillStyle = '#18253a';
      ctx.fill(land, 'evenodd');
      ctx.strokeStyle = 'rgba(210,174,92,0.18)';
      ctx.lineWidth = 1 / k;
      ctx.stroke(countryBorders(g, (p) => world.data.provinces[p].a3));
      ctx.strokeStyle = 'rgba(120,150,190,0.25)';
      ctx.lineWidth = 0.8 / k;
      ctx.stroke(g.coast);
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [geo, world]);
  return (
    <div className="pointer-events-none fixed inset-0 menu-backdrop">
      <canvas ref={ref} className="h-full w-full opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/70 to-transparent" />
    </div>
  );
}

export function MenuTitle({ small }: { small?: boolean }) {
  const t = useT();
  return (
    <div className={small ? 'mb-4' : 'mb-10'}>
      <div className="text-[11px] uppercase tracking-[0.5em] text-gold/80">{t('app.tagline')}</div>
      <h1 className={`font-display ${small ? 'text-3xl' : 'text-5xl md:text-6xl'} mt-1 tracking-[0.06em] text-ink`}>
        AGE <span className="text-gold">of</span> CONQUERORS
      </h1>
      <div className="mt-3 h-px w-40 bg-gradient-to-r from-gold to-transparent" />
    </div>
  );
}

/** Menü alt sayfaları için çerçeve */
export default function MenuFrame({ title, children, wide, actions }: { title: string; children: ReactNode; wide?: boolean; actions?: ReactNode }) {
  const t = useT();
  return (
    <div className="relative h-full overflow-hidden">
      <MenuBackdrop />
      <div className="relative z-10 flex h-full flex-col px-4 py-5 md:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
            <ChevronLeft size={16} /> {t('menu.backToMenu')}
          </Link>
          {actions}
        </div>
        <h1 className="font-display mt-3 text-3xl tracking-wide text-ink">{title}</h1>
        <div className="mt-1 h-px w-32 bg-gradient-to-r from-gold to-transparent" />
        <div className={`mt-4 min-h-0 flex-1 overflow-y-auto pr-1 ${wide ? '' : 'max-w-4xl'}`}>{children}</div>
      </div>
    </div>
  );
}
