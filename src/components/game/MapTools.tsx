'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useGame } from '@/store/game';
import { useUI } from '@/store/ui';
import { useT, useLang } from '@/i18n';
import { Flag } from '@/components/ui';
import { MapRenderer } from '@/components/map/renderer';
import { REBEL_TAG } from '@/game/query';

const MW = 200;

/** Mini harita (sahiplik + görünüm çerçevesi, tıklayınca oraya gider) ve ülke/bölge arama */
export default function MapTools() {
  const t = useT();
  const lang = useLang();
  const state = useGame((s) => s.state);
  const world = useGame((s) => s.world);
  const geo = useGame((s) => s.geo);
  const ui = useUI();
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const mh = geo ? Math.round((MW * geo.height) / geo.width) : 100;
  const k = geo ? MW / geo.width : 1;
  const ownersVersion = state?.versions.owners ?? 0;

  // Sahiplik katmanı: yalnızca sahiplik değişince yeniden çizilir
  useEffect(() => {
    const cv = base.current;
    const st = useGame.getState().state;
    if (!cv || !world || !st) return;
    const g = cv.getContext('2d');
    if (!g) return;
    g.fillStyle = '#0b1623';
    g.fillRect(0, 0, MW, mh);
    for (let p = 0; p < world.P; p++) {
      const owner = st.provinces[p].owner;
      const col = owner === REBEL_TAG ? [60, 60, 60] : (st.countries[owner]?.color ?? [120, 120, 120]);
      g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      g.fillRect(world.x[p] * k - 1.5, world.y[p] * k - 1.5, 3, 3);
    }
  }, [world, ownersVersion, k, mh]);

  // Görünüm çerçevesi
  useEffect(() => {
    const id = setInterval(() => {
      const cv = over.current;
      const v = MapRenderer.lastView;
      if (!cv || !v) return;
      const g = cv.getContext('2d');
      if (!g) return;
      const main = document.querySelector('canvas[role="application"]') as HTMLCanvasElement | null;
      const w = (main?.clientWidth ?? 800) / v.scale;
      const h = (main?.clientHeight ?? 600) / v.scale;
      g.clearRect(0, 0, MW, mh);
      g.strokeStyle = '#ecd68a';
      g.lineWidth = 1.5;
      g.strokeRect(v.x * k, v.y * k, Math.max(4, w * k), Math.max(4, h * k));
    }, 250);
    return () => clearInterval(id);
  }, [k, mh]);

  const results = useMemo(() => {
    const s = q.trim().toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en');
    if (!state || !world || s.length < 2) return [];
    const out: { key: string; label: string; flag?: string; go: () => void }[] = [];
    for (const c of Object.values(state.countries)) {
      if (!c.alive || c.tag === REBEL_TAG || c.capital < 0) continue;
      const nm = lang === 'tr' ? c.name : c.nameEn;
      if (nm.toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en').includes(s))
        out.push({ key: `c${c.tag}`, label: nm, flag: c.flag, go: () => (ui.focusOn(world.x[c.capital], world.y[c.capital], 0.9), ui.openRight({ kind: 'country', tag: c.tag })) });
      if (out.length >= 5) break;
    }
    for (let p = 0; p < world.P && out.length < 10; p++) {
      const wp = world.data.provinces[p];
      const nm = state.provinceNames?.[p] ?? (lang === 'tr' ? wp.name : wp.nameEn);
      if (nm.toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en').includes(s)) out.push({ key: `p${p}`, label: nm, flag: state.countries[state.provinces[p].owner]?.flag, go: () => (ui.focusOn(world.x[p], world.y[p], 2.2), ui.openRight({ kind: 'province', id: p })) });
    }
    return out;
  }, [q, state, world, lang, ui]);

  if (!state || !world || !geo) return null;
  return (
    <>
      <div className="absolute left-2 top-2 z-20">
        {open ? (
          <div className="w-60 rounded border border-line-2 bg-panel/95 shadow-xl">
            <div className="flex items-center gap-1 px-2 py-1">
              <Search size={14} className="text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter' && results[0]) {
                    results[0].go();
                    setOpen(false);
                  }
                }}
                placeholder={t('search.placeholder')}
                aria-label={t('search.placeholder')}
                className="min-w-0 flex-1 bg-transparent py-0.5 text-xs outline-none"
              />
              <button type="button" onClick={() => setOpen(false)} aria-label={t('common.close')} className="text-muted hover:text-ink">
                <X size={14} />
              </button>
            </div>
            {results.map((r) => (
              <button
                type="button"
                key={r.key}
                onClick={() => {
                  r.go();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-1.5 border-t border-line px-2 py-1 text-left text-xs text-ink-2 hover:bg-white/5"
              >
                {r.flag && <Flag code={r.flag} className="h-3" />}
                <span className="truncate">{r.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} title={t('search.placeholder')} aria-label={t('search.placeholder')} className="flex h-8 w-8 items-center justify-center rounded border border-line-2 bg-panel/90 text-muted hover:text-gold">
            <Search size={15} />
          </button>
        )}
      </div>
      <div
        className="absolute bottom-12 right-12 z-10 hidden cursor-pointer overflow-hidden rounded border border-line-2 bg-bg shadow-xl md:block"
        style={{ width: MW, height: mh }}
        data-testid="minimap"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ui.focusOn((e.clientX - r.left) / k, (e.clientY - r.top) / k);
        }}
        role="button"
        aria-label={t('minimap.label')}
      >
        <canvas ref={base} width={MW} height={mh} className="absolute inset-0" />
        <canvas ref={over} width={MW} height={mh} className="absolute inset-0" />
      </div>
    </>
  );
}
