'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { GameState, GeoData, MapMode, Tag } from '@/game/types';
import type { World } from '@/game/world';
import { makeCtx, type Ctx } from '@/game/ctx';
import { buildGeometry, hitTest, type MapGeometry } from './geometry';
import { MapRenderer, type Selection } from './renderer';
import { computeColoring, type ProvinceColoring } from './modes';
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const frame = useRef<number>(0);
  const hoverRef = useRef<number>(-1);
  const quality = useSettings((s) => s.mapQuality);
  const animations = useSettings((s) => s.animations);
  const lang = useSettings((s) => s.language);

  const geometry = useMemo(() => geometryFor(geo), [geo]);
  const rctx = useMemo(() => props.ctx ?? makeCtx(world, state), [props.ctx, world, state]);

  // Renklendirme: siyasi katman yalnızca sahiplik değişince yeniden hesaplanır
  const coloringKey = mode === 'political' || mode === 'terrain' ? `${mode}|${state.versions.owners}|${viewer}` : `${mode}|${viewer}|${state.turn}|${state.versions.owners}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const coloring = useMemo<ProvinceColoring>(() => computeColoring(rctx, mode, viewer), [coloringKey]);

  // Son durumu çizim döngüsünün okuyabilmesi için ref'lerde tut (render sonrası güncellenir)
  const latest = useRef({ rctx, selection, props, quality, animations, lang, coloring });
  useLayoutEffect(() => {
    latest.current = { rctx, selection, props, quality, animations, lang, coloring };
  });

  const requestDraw = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(drawNow);
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
    }, time);
    // Muharebe animasyonu
    if (l.animations && Object.keys(l.rctx.s.battles).length) {
      setTimeout(() => requestDraw(), 50);
    }
  }

  // Kurulum
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new MapRenderer(canvas, geometry, world);
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
      down = { x, y, button: e.button, moved: false, vx: r.view.x, vy: r.view.y };
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
          requestDraw();
        }
        pinchDist = d;
        return;
      }
      if (down) {
        const dx = x - down.x;
        const dy = y - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 5) down.moved = true;
        if (down.moved) {
          r.view.x = down.vx - dx / r.view.scale;
          r.view.y = down.vy - dy / r.view.scale;
          r.clampView();
          requestDraw();
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
      const [x, y] = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (!down) return;
      const wasDrag = down.moved;
      const button = down.button;
      down = null;
      if (wasDrag) return;
      const p = pick(x, y);
      latest.current.props.onClick?.({ ...p, button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
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
      requestDraw();
    };
    const onDbl = (e: MouseEvent) => {
      const r = rendererRef.current;
      if (!r) return;
      const [x, y] = local(e);
      r.zoomAt(x, y, 1.8);
      requestDraw();
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
      else if (e.key === 'PageDown') r.zoomAt(r.cssW / 2, r.cssH / 2, 0.8);
      else return;
      r.clampView();
      requestDraw();
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
    <div ref={wrapRef} className={`relative h-full w-full overflow-hidden ${props.className ?? ''}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none select-none" style={{ cursor: 'crosshair' }} aria-label="Dünya haritası" role="img" />
      <div className="pointer-events-none absolute bottom-2 right-3 flex gap-1">
        <ZoomButtons rendererRef={rendererRef} requestDraw={requestDraw} />
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
