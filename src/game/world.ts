/**
 * Statik dünya grafiği. world.json'dan bir kez kurulur ve tüm sistemlerce paylaşılır.
 * Düğümler: 0..P-1 bölgeler, P..N-1 deniz düğümleri.
 */
import type { Terrain, WorldData } from './types';

export const EDGE_LAND = 0;
export const EDGE_CROSS = 1;
export const EDGE_EMBARK = 2; // kara ↔ deniz
export const EDGE_SEA = 3;

export interface World {
  data: WorldData;
  /** bölge sayısı */
  P: number;
  /** toplam düğüm */
  N: number;
  x: Float32Array;
  y: Float32Array;
  lon: Float32Array;
  lat: Float32Array;
  edgeStart: Int32Array;
  edgeTo: Int32Array;
  edgeKm: Float32Array;
  edgeKind: Uint8Array;
  /** deniz kenarı bir boğaz/kanal ise denetleyen bölge (-1 yoksa) */
  edgeControl: Int32Array;
  terrain: Terrain[];
  coastal: Uint8Array;
  idIndex: Map<string, number>;
  /** a3 → bölgeler (senaryo kurulumu için) */
  byA3: Map<string, number[]>;
  /** Toplam kara alanı (km²) */
  totalArea: number;
}

const R = 6371.0088;
const DEG = Math.PI / 180;

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function buildWorld(data: WorldData): World {
  const P = data.provinces.length;
  const S = data.sea.length;
  const N = P + S;
  const x = new Float32Array(N);
  const y = new Float32Array(N);
  const lon = new Float32Array(N);
  const lat = new Float32Array(N);
  const terrain: Terrain[] = [];
  const coastal = new Uint8Array(P);
  const idIndex = new Map<string, number>();
  const byA3 = new Map<string, number[]>();
  let totalArea = 0;

  data.provinces.forEach((p, i) => {
    x[i] = p.x;
    y[i] = p.y;
    lon[i] = p.lon;
    lat[i] = p.lat;
    terrain.push(p.terrain);
    coastal[i] = p.coastal && p.sea.length > 0 ? 1 : 0;
    idIndex.set(p.id, i);
    if (!byA3.has(p.a3)) byA3.set(p.a3, []);
    byA3.get(p.a3)!.push(i);
    totalArea += p.area;
  });
  data.sea.forEach((n, i) => {
    x[P + i] = n.x;
    y[P + i] = n.y;
    lon[P + i] = n.lon;
    lat[P + i] = n.lat;
  });

  // Kenar listeleri
  const adj: { to: number; kind: number; control: number }[][] = Array.from({ length: N }, () => []);
  const add = (a: number, b: number, kind: number, control = -1) => {
    if (a === b) return;
    if (adj[a].some((e) => e.to === b)) return;
    adj[a].push({ to: b, kind, control });
  };
  data.provinces.forEach((p, i) => {
    for (const j of p.adj) add(i, j, EDGE_LAND);
    for (const j of p.cross) add(i, j, EDGE_CROSS);
    for (const s of p.sea) {
      add(i, P + s, EDGE_EMBARK);
      add(P + s, i, EDGE_EMBARK);
    }
  });
  const straitControl = new Map<string, number>();
  for (const st of data.straits) {
    if (st.control >= 0) {
      straitControl.set(`${st.a}|${st.b}`, st.control);
      straitControl.set(`${st.b}|${st.a}`, st.control);
    }
  }
  data.sea.forEach((n, i) => {
    for (const j of n.adj) add(P + i, P + j, EDGE_SEA, straitControl.get(`${i}|${j}`) ?? -1);
  });

  let E = 0;
  for (const a of adj) E += a.length;
  const edgeStart = new Int32Array(N + 1);
  const edgeTo = new Int32Array(E);
  const edgeKm = new Float32Array(E);
  const edgeKind = new Uint8Array(E);
  const edgeControl = new Int32Array(E);
  let k = 0;
  for (let i = 0; i < N; i++) {
    edgeStart[i] = k;
    for (const e of adj[i]) {
      edgeTo[k] = e.to;
      edgeKind[k] = e.kind;
      edgeControl[k] = e.control;
      edgeKm[k] = Math.max(5, haversineKm(lon[i], lat[i], lon[e.to], lat[e.to]));
      k++;
    }
  }
  edgeStart[N] = k;

  return { data, P, N, x, y, lon, lat, edgeStart, edgeTo, edgeKm, edgeKind, edgeControl, terrain, coastal, idIndex, byA3, totalArea };
}

export function isSeaNode(w: World, node: number): boolean {
  return node >= w.P;
}

/** Kara komşuları (sınır + boğaz geçişi) */
export function landNeighbors(w: World, p: number): number[] {
  const out: number[] = [];
  for (let e = w.edgeStart[p]; e < w.edgeStart[p + 1]; e++) {
    const k = w.edgeKind[e];
    if (k === EDGE_LAND || k === EDGE_CROSS) out.push(w.edgeTo[e]);
  }
  return out;
}

/** Yalnızca ortak sınırlı kara komşuları */
export function borderNeighbors(w: World, p: number): number[] {
  const out: number[] = [];
  for (let e = w.edgeStart[p]; e < w.edgeStart[p + 1]; e++) if (w.edgeKind[e] === EDGE_LAND) out.push(w.edgeTo[e]);
  return out;
}

export function nodeDistanceKm(w: World, a: number, b: number): number {
  return haversineKm(w.lon[a], w.lat[a], w.lon[b], w.lat[b]);
}
