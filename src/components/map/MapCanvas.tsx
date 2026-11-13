'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameState, GeoData, MapMode, Tag } from '@/game/types';
import type { World } from '@/game/world';
import { makeCtx, type Ctx } from '@/game/ctx';
import { buildGeometry, hitTest, type MapGeometry } from './geometry';
import { MapRenderer, type Selection } from './renderer';
import { computeColoring, type ProvinceColoring, daltonizeColoring } from './modes';
import { useSettings } from '@/store/settings';

export interface MapClick {
  province: number;
  /** deniz düğümü (dünya düğüm indeksi) ya da -1 */
  seaNode: number;
  army: string | null;
  battle: string | null;
  button: number;
  shift: boolean;
  ctrl: boolean;
  /** dokunmatik ekrandan (sağ tık yok) */
  touch: boolean;
}

export interface MapHover {
  province: number;
  seaNode: number;
  army: string | null;
  x: number;
  y: number;
}

export interface FocusRequest {
  x: number;
  y: number;
  scale?: number;
  nonce: number;
}

interface Props {
  world: World;
  geo: GeoData;
  state: GameState;
  ctx?: Ctx | null;
  mode: MapMode;
  viewer: Tag;
  selection: Selection;
  showSeaNodes?: boolean;
  previewPath?: number[] | null;
  previewArmy?: string | null;
  onClick?: (c: MapClick) => void;
  onHover?: (h: MapHover | null) => void;
  focus?: FocusRequest | null;
  className?: string;
}

const geomCache = new WeakMap<GeoData, MapGeometry>();
function geometryFor(geo: GeoData): MapGeometry {
  let g = geomCache.get(geo);
  if (!g) geomCache.set(geo, (g = buildGeometry(geo)));
  return g;
}

export default function MapCanvas(props: Props) {
  const { world, geo, state, mode, viewer, selection, focus } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const frame = useRef<number>(0);
  const hoverRef = useRef<number>(-1);
  const [kbd, setKbd] = useState(false);
  const quality = useSettings((s) => s.mapQuality);
  const animations = useSettings((s) => s.animations);
  const lang = useSettings((s) => s.language);

  const geometry = useMemo(() => geometryFor(geo), [geo]);
  const rctx = useMemo(() => props.ctx ?? makeCtx(world, state), [props.ctx, world, state]);

  // Renklendirme: siyasi katman yalnızca sahiplik değişince, diğer katmanlar en çok ayda bir yeniden hesaplanır
  const month = Math.floor(state.day / 30.44);
  const coloringKey = mode === 'political' || mode === 'terrain' ? `${mode}|${state.versions.owners}|${viewer}` : `${mode}|${viewer}|${month}|${state.versions.owners}`;
  const colorBlind = useSettings((s) => s.colorBlind);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const coloring = useMemo<ProvinceColoring>(() => (colorBlind ? daltonizeColoring(computeColoring(rctx, mode, viewer)) : computeColoring(rctx, mode, viewer)), [coloringKey, colorBlind]);

  // Son durumu çizim döngüsünün okuyabilmesi için ref'lerde tut (render sonrası güncellenir)
  const latest = useRef({ rctx, selection, props, quality, animations, lang, coloring });
  useLayoutEffect(() => {
    latest.current = { rctx, selection, props, quality, animations, lang, coloring };
  });

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestDraw = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(drawNow);
  };
  /** Kaydırma/yakınlaştırma: hızlı önizleme, hareket durunca tam kalite */
  const viewDraw = () => {
    rendererRef.current?.viewChanged();
    requestDraw();
  };

  function drawNow(time: number) {
    frame.current = 0;
    const r = rendererRef.current;
    const l = latest.current;
    if (!r) return;
    r.draw(l.rctx, l.coloring, l.selection, hoverRef.current, {
      quality: l.quality,
      animations: l.animations,
      lang: l.lang,
      showSeaNodes: !!l.props.showSeaNodes,
      previewPath: l.props.previewPath ?? null,
      previewArmy: l.props.previewArmy ?? null,
      fog: l.rctx.s.rules.fogOfWar,
      relief: l.props.mode === 'political' || l.props.mode === 'diplomatic',
    }, time);
    if (r.needsSettle && !settleTimer.current) {
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        requestDraw();
      }, 180);
    }
    // Muharebe animasyonu
    if (l.animations && Object.keys(l.rctx.s.battles).length) {
      setTimeout(() => requestDraw(), 50);
    }
  }

  // Kurulum
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new MapRenderer(canvas, baseRef.current!, geometry, world);
    rendererRef.current = r;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      r.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
      r.clampView();
      requestDraw();
    };
    resize();
    if (MapRenderer.lastView) r.view = { ...MapRenderer.lastView };
    else r.fitWorld();
    r.clampView();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    requestDraw();
    return () => {
      ro.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = null;
      frame.current = 0;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, world]);

  // Veri değişince yeniden çiz
  useEffect(() => {
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rctx, selection, mode, viewer, quality, animations, lang, coloring, props.showSeaNodes, props.previewPath, props.previewArmy]);

  // Odaklanma isteği
  useEffect(() => {
    if (!focus || !rendererRef.current) return;
    const r = rendererRef.current;
    r.centerOn(focus.x, focus.y, focus.scale ?? Math.max(r.view.scale, 0.9));
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  // Etkileşim
  useEffect(() => {
    const canvas = canvasRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let down: { x: number; y: number; button: number; moved: boolean; vx: number; vy: number } | null = null;
    let pinchDist = 0;
    let lastTap = { t: 0, x: 0, y: 0 };
    // Dokunmatik ekranda uzun basış = sağ tık (hedef gösterme)
    let longPress: ReturnType<typeof setTimeout> | null = null;
    const clearLong = () => {
      if (longPress) clearTimeout(longPress);
      longPress = null;
    };

    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
    };

    const pick = (sx: number, sy: number) => {
      const r = rendererRef.current!;
      let army: string | null = null;
      let battle: string | null = null;
      for (let i = r.markerHits.length - 1; i >= 0; i--) {
        const m = r.markerHits[i];
        if (sx >= m.x && sx <= m.x + m.w && sy >= m.y && sy <= m.y + m.h) {
          if (m.kind === 'army') army = m.id;
          else battle = m.id;
          break;
        }
      }
      const [wx, wy] = r.screenToWorld(sx, sy);
      const province = hitTest(geometry, wx, wy);
      let seaNode = -1;
      if (province < 0) {
        // En yakın deniz düğümü (ekranda 40 piksel içinde)
        let best = Infinity;
        const lim = 40 / r.view.scale;
        for (let i = world.P; i < world.N; i++) {
          const dx = world.x[i] - wx;
          const dy = world.y[i] - wy;
          if (Math.abs(dx) > lim || Math.abs(dy) > lim) continue;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            seaNode = i;
          }
        }
      }
      return { province, seaNode, army, battle };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      pointers.set(e.pointerId, { x, y });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        down = null;
        return;
      }
      const r = rendererRef.current!;
      setKbd(false);
      down = { x, y, button: e.button, moved: false, vx: r.view.x, vy: r.view.y };
      clearLong();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        longPress = setTimeout(() => {
          longPress = null;
          if (!down || down.moved) return;
          const p = pick(down.x, down.y);
          down = null;
          if (navigator.vibrate) navigator.vibrate(15);
          latest.current.props.onClick?.({ ...p, button: 2, shift: false, ctrl: false, touch: true });
        }, 500);
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      const [x, y] = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          r.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist);
          viewDraw();
        }
        pinchDist = d;
        return;
      }
      if (down) {
        const dx = x - down.x;
        const dy = y - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 8) {
          down.moved = true;
          clearLong();
        }
        if (down.moved) {
          r.view.x = down.vx - dx / r.view.scale;
          r.view.y = down.vy - dy / r.view.scale;
          r.clampView();
          viewDraw();
          return;
        }
      }
      const p = pick(x, y);
      if (p.province !== hoverRef.current) {
        hoverRef.current = p.province;
        requestDraw();
      }
      latest.current.props.onHover?.({ province: p.province, seaNode: p.seaNode, army: p.army, x, y });
    };
    const onUp = (e: PointerEvent) => {
      clearLong();
      const [x, y] = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (!down) return;
      const wasDrag = down.moved;
      const button = down.button;
      down = null;
      if (wasDrag) return;
      const p = pick(x, y);
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      // Çift dokunma: dokunulan ülkeye yakınlaş (ülkenin tamamı ekrana sığar)
      if (touch) {
        const now = performance.now();
        const dbl = now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 36;
        lastTap = { t: dbl ? 0 : now, x, y };
        if (dbl) {
          zoomToCountry(p.province, x, y);
          return;
        }
      }
      latest.current.props.onClick?.({ ...p, button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, touch });
    };
    const onLeave = () => {
      if (hoverRef.current !== -1) {
        hoverRef.current = -1;
        requestDraw();
      }
      latest.current.props.onHover?.(null);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rendererRef.current;
      if (!r) return;
      const [x, y] = local(e);
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
      r.zoomAt(x, y, factor);
      viewDraw();
    };
    const zoomToCountry = (province: number, sx: number, sy: number) => {
      const r = rendererRef.current;
      if (!r) return;
      const s = latest.current.rctx.s;
      if (province < 0) {
        r.zoomAt(sx, sy, 1.8);
        viewDraw();
        return;
      }
      const owner = s.provinces[province].owner;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const bb = geometry.bbox;
      const px = world.x[province];
      for (let i = 0; i < world.P; i++) {
        if (s.provinces[i].owner !== owner) continue;
        // Uzak denizaşırı topraklar ülkeyi küçültmesin
        if (Math.abs(world.x[i] - px) > geometry.width * 0.18) continue;
        if (bb[i * 4] < x0) x0 = bb[i * 4];
        if (bb[i * 4 + 1] < y0) y0 = bb[i * 4 + 1];
        if (bb[i * 4 + 2] > x1) x1 = bb[i * 4 + 2];
        if (bb[i * 4 + 3] > y1) y1 = bb[i * 4 + 3];
      }
      const scale = Math.min(6, Math.min(r.cssW / Math.max(1, x1 - x0), r.cssH / Math.max(1, y1 - y0)) * 0.8);
      r.centerOn((x0 + x1) / 2, (y0 + y1) / 2, scale);
      viewDraw();
    };
    const onDbl = (e: MouseEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      const [x, y] = local(e);
      r.zoomAt(x, y, 1.8);
      viewDraw();
    };
    const onKey = (e: KeyboardEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const step = 80 / r.view.scale;
      if (e.key === 'ArrowLeft') r.view.x -= step;
      else if (e.key === 'ArrowRight') r.view.x += step;
      else if (e.key === 'ArrowUp') r.view.y -= step;
      else if (e.key === 'ArrowDown') r.view.y += step;
      else if (e.key === 'PageUp') r.zoomAt(r.cssW / 2, r.cssH / 2, 1.25);
      else if (e.key === 'PageDown' || e.key === '-') r.zoomAt(r.cssW / 2, r.cssH / 2, 0.8);
      else if (e.key === '+' || e.key === '=') r.zoomAt(r.cssW / 2, r.cssH / 2, 1.25);
      else if ((e.key === 'Enter' || e.code === 'KeyG') && !document.querySelector('[role="dialog"]') && (t === document.body || t === canvas)) {
        // Klavye imleci: ekran ortasındaki bölgeyi seç (Enter) ya da seçili orduyu oraya gönder (Shift+Enter / G)
        const p = pick(r.cssW / 2, r.cssH / 2);
        setKbd(true);
        latest.current.props.onClick?.({ ...p, button: e.shiftKey || e.code === 'KeyG' ? 2 : 0, shift: false, ctrl: false, touch: false });
        e.preventDefault();
        return;
      } else return;
      setKbd(true);
      r.clampView();
      viewDraw();
    };
    const prevent = (e: Event) => e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('contextmenu', prevent);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('contextmenu', prevent);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, world]);

  return (
    <div ref={wrapRef} className={`relative h-full w-full overflow-hidden ${props.className ?? ''}`} style={{ background: '#0e1c2e' }}>
      <canvas ref={baseRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden="true" />
      <canvas ref={canvasRef} tabIndex={0} className="relative block h-full w-full touch-none select-none outline-none" style={{ cursor: 'crosshair' }} aria-label="Dünya haritası. Ok tuşları: kaydır, artı/eksi: yakınlaştır, Enter: ortadaki bölgeyi seç, G: seçili orduyu gönder" role="application" />
      {kbd && <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold shadow-[0_0_0_1px_rgba(0,0,0,0.8)]" aria-hidden data-testid="kbd-cursor" />}
      <div className="pointer-events-none absolute bottom-2 right-3 flex gap-1">
        <ZoomButtons rendererRef={rendererRef} requestDraw={viewDraw} />
      </div>
    </div>
  );
}

function ZoomButtons({ rendererRef, requestDraw }: { rendererRef: React.RefObject<MapRenderer | null>; requestDraw: () => void }) {
  const zoom = (f: number) => {
    const r = rendererRef.current;
    if (!r) return;
    r.zoomAt(r.cssW / 2, r.cssH / 2, f);
    requestDraw();
  };
  const fit = () => {
    const r = rendererRef.current;
    if (!r) return;
    r.fitWorld();
    requestDraw();
  };
  return (
    <div className="pointer-events-auto flex flex-col overflow-hidden rounded border border-line bg-panel/90 text-sm">
      <button type="button" className="px-2 py-1 hover:bg-white/10" onClick={() => zoom(1.4)} aria-label="Yakınlaştır">
        +
      </button>
      <button type="button" className="border-t border-line px-2 py-1 hover:bg-white/10" onClick={() => zoom(1 / 1.4)} aria-label="Uzaklaştır">
        −
      </button>
      <button type="button" className="border-t border-line px-2 py-1 text-[10px] hover:bg-white/10" onClick={fit} aria-label="Tüm dünya">
        ◎
      </button>
    </div>
  );
}
