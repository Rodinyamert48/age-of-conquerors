/**
 * Harita geometrisi: world-geo.json'daki topolojik yaylardan bölge yolları, sınırlar ve isabet testi.
 * Geometri bir kez oluşturulur; sahiplik değiştiğinde yalnızca ülke sınır yolu yeniden kurulur.
 */
import type { GeoData } from '@/game/types';

export interface MapGeometry {
  width: number;
  height: number;
  arcs: Float32Array[];
  arcSides: [number, number][];
  provincePaths: Path2D[];
  bbox: Float32Array;
  provinceBorders: Path2D;
  coast: Path2D;
  rivers: Path2D[];
  lakes: Path2D;
  grid: Map<number, number[]>;
  cell: number;
  /** her bölgenin yayları (sınır vurgusu için) */
  provinceArcs: number[][];
}

function decode(d: number[], scale: number): Float32Array {
  const out = new Float32Array(d.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < d.length; i += 2) {
    x += d[i];
    y += d[i + 1];
    out[i] = x / scale;
    out[i + 1] = y / scale;
  }
  return out;
}

function addArc(p: Path2D, a: Float32Array, move: boolean) {
  for (let i = 0; i < a.length; i += 2) {
    if (i === 0) {
      if (move) p.moveTo(a[0], a[1]);
      continue;
    }
    p.lineTo(a[i], a[i + 1]);
  }
}

function addArcReversed(p: Path2D, a: Float32Array, move: boolean) {
  const n = a.length;
  for (let i = n - 2; i >= 0; i -= 2) {
    if (i === n - 2) {
      if (move) p.moveTo(a[i], a[i + 1]);
      continue;
    }
    p.lineTo(a[i], a[i + 1]);
  }
}

export function buildGeometry(geo: GeoData): MapGeometry {
  const arcs = geo.arcs.map((d) => decode(d, geo.scale));
  const P = geo.provinces.length;
  const provincePaths: Path2D[] = [];
  const bbox = new Float32Array(P * 4);
  const provinceArcs: number[][] = [];
  for (let i = 0; i < P; i++) {
    const path = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const used: number[] = [];
    for (const poly of geo.provinces[i]) {
      for (const ring of poly) {
        let first = true;
        for (const ai of ring) {
          const idx = ai < 0 ? ~ai : ai;
          used.push(idx);
          const a = arcs[idx];
          if (ai < 0) addArcReversed(path, a, first);
          else addArc(path, a, first);
          first = false;
          for (let k = 0; k < a.length; k += 2) {
            if (a[k] < x0) x0 = a[k];
            if (a[k] > x1) x1 = a[k];
            if (a[k + 1] < y0) y0 = a[k + 1];
            if (a[k + 1] > y1) y1 = a[k + 1];
          }
        }
        path.closePath();
      }
    }
    provincePaths.push(path);
    provinceArcs.push(used);
    bbox[i * 4] = x0;
    bbox[i * 4 + 1] = y0;
    bbox[i * 4 + 2] = x1;
    bbox[i * 4 + 3] = y1;
  }
  const provinceBorders = new Path2D();
  const coast = new Path2D();
  geo.arcSides.forEach(([l, r], i) => {
    const a = arcs[i];
    if (r >= 0) addArc(provinceBorders, a, true);
    else if (l >= 0) addArc(coast, a, true);
  });
  // Nehirler önem sırasına göre üç katmanda
  const rivers = [new Path2D(), new Path2D(), new Path2D()];
  for (const rv of geo.rivers) {
    const a = decode(rv.d, geo.scale);
    const layer = rv.r <= 3 ? 0 : rv.r <= 5 ? 1 : 2;
    addArc(rivers[layer], a, true);
  }
  const lakes = new Path2D();
  for (const d of geo.lakes) {
    const a = decode(d, geo.scale);
    addArc(lakes, a, true);
    lakes.closePath();
  }
  // İsabet testi ızgarası
  const cell = 64;
  const grid = new Map<number, number[]>();
  for (let i = 0; i < P; i++) {
    const cx0 = Math.floor(bbox[i * 4] / cell), cy0 = Math.floor(bbox[i * 4 + 1] / cell);
    const cx1 = Math.floor(bbox[i * 4 + 2] / cell), cy1 = Math.floor(bbox[i * 4 + 3] / cell);
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cx * 10007 + cy;
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(i);
      }
  }
  return { width: geo.width, height: geo.height, arcs, arcSides: geo.arcSides, provincePaths, bbox, provinceBorders, coast, rivers, lakes, grid, cell, provinceArcs };
}

let hitCtx: CanvasRenderingContext2D | null = null;
function getHitCtx(): CanvasRenderingContext2D {
  if (!hitCtx) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    hitCtx = c.getContext('2d')!;
  }
  return hitCtx;
}

/** Harita koordinatındaki bölge (-1: deniz) */
export function hitTest(g: MapGeometry, x: number, y: number): number {
  const k = Math.floor(x / g.cell) * 10007 + Math.floor(y / g.cell);
  const cands = g.grid.get(k);
  if (!cands) return -1;
  const ctx = getHitCtx();
  for (const i of cands) {
    if (x < g.bbox[i * 4] || x > g.bbox[i * 4 + 2] || y < g.bbox[i * 4 + 1] || y > g.bbox[i * 4 + 3]) continue;
    if (ctx.isPointInPath(g.provincePaths[i], x, y, 'evenodd')) return i;
  }
  return -1;
}

/** Sahipleri farklı iki bölgeyi ayıran yaylar (ülke sınırları) */
export function countryBorders(g: MapGeometry, owner: (p: number) => string): Path2D {
  const path = new Path2D();
  g.arcSides.forEach(([l, r], i) => {
    if (r >= 0 && owner(l) !== owner(r)) addArc(path, g.arcs[i], true);
  });
  return path;
}

/** Kümenin dış sınırı (seçili ülke/bölge vurgusu) */
export function outline(g: MapGeometry, members: (p: number) => boolean, candidates?: Iterable<number>): Path2D {
  const path = new Path2D();
  const arcSet = new Set<number>();
  if (candidates) {
    for (const p of candidates) for (const a of g.provinceArcs[p]) arcSet.add(a);
  }
  const iter = candidates ? arcSet : g.arcSides.keys();
  for (const i of iter) {
    const [l, r] = g.arcSides[i];
    const inL = l >= 0 && members(l);
    const inR = r >= 0 && members(r);
    if (inL !== inR) addArc(path, g.arcs[i], true);
  }
  return path;
}
