/**
 * Ordu hareketi, rota bulma, ikmal ve yıpranma.
 * Rotalar yalnızca geçerli komşuluklardan (kara sınırı, boğaz geçişi, liman-deniz, deniz-deniz) oluşur.
 */
import type { Army, Tag } from './types';
import { UNIT_DEFS, UNIT_ORDER } from './defs/units';
import { TERRAIN_DEFS } from './defs/terrain';
import { EDGE_CROSS, EDGE_EMBARK, EDGE_LAND, EDGE_SEA, type World } from './world';
import { armiesAt, armiesOf, getMods, invalidateArmies, type Ctx } from './ctx';
import { atWar, canEnterProvince, fortLevel, hasAccess, hostileArmies, armySoldiers, isFriendly } from './query';
import { B_MIL, B_PORT, B_ROAD } from './economy';
import { BAL, DAYS_PER_MONTH } from './balance';
import { notify } from './notify';

/** Deniz nakliyesindeki kara birliklerinin hızı (km/gün) */
export const TRANSPORT_SPEED = 160;
const EMBARK_DAYS = 1.5;
/** Bir savaş gemisinin denizde koruyup taşıyabildiği asker sayısı */
export const TRANSPORT_PER_SHIP = 4000;

/** Ülkenin deniz nakliye kapasitesi (asker). Donanması olmayan ülke ordusunu denizden taşıyamaz. */
export function transportCapacity(ctx: Ctx, tag: Tag): number {
  let ships = 0;
  for (const a of armiesOf(ctx, tag)) if (a.isNavy) ships += a.units.navy;
  return ships * TRANSPORT_PER_SHIP;
}

/** Kara ordusu denize açılabilir mi (zaten denizdeyse karaya dönebilmesi için her zaman evet) */
export function canEmbark(ctx: Ctx, a: Army): boolean {
  if (a.isNavy) return true;
  if (a.location >= ctx.w.P) return true;
  return armySoldiers(a) <= transportCapacity(ctx, a.owner);
}

export function armyBaseSpeed(ctx: Ctx, a: Army): number {
  const mods = getMods(ctx, a.owner);
  if (a.isNavy) return UNIT_DEFS.navy.speed * Math.max(0.5, 1 + mods.moveSpeed * 0.5);
  let sp = Infinity;
  for (const t of UNIT_ORDER) {
    if (t === 'navy' || !a.units[t]) continue;
    sp = Math.min(sp, UNIT_DEFS[t].speed);
  }
  if (!isFinite(sp)) sp = UNIT_DEFS.infantry.speed;
  return sp * Math.max(0.3, 1 + mods.moveSpeed);
}

function edgeIndex(w: World, from: number, to: number): number {
  for (let e = w.edgeStart[from]; e < w.edgeStart[from + 1]; e++) if (w.edgeTo[e] === to) return e;
  return -1;
}

/** Kenarı geçme süresi (gün) */
export function edgeDays(ctx: Ctx, a: Army, e: number, baseSpeed: number): number {
  const { w, s } = ctx;
  const to = w.edgeTo[e];
  const km = w.edgeKm[e];
  const kind = w.edgeKind[e];
  if (a.isNavy) {
    return km / baseSpeed + (kind === EDGE_EMBARK ? 0.5 : 0);
  }
  if (kind === EDGE_SEA) return km / TRANSPORT_SPEED;
  if (kind === EDGE_EMBARK) return EMBARK_DAYS + km / TRANSPORT_SPEED;
  const terr = TERRAIN_DEFS[w.terrain[to]];
  const road = s.provinces[to].buildings[B_ROAD];
  let days = km / (baseSpeed * terr.move * (1 + 0.15 * road));
  if (kind === EDGE_CROSS) days = days * 1.6 + 1;
  return days;
}

/** Boğaz/kanal kenarı düşman denetiminde mi */
function straitBlocked(ctx: Ctx, tag: Tag, e: number): boolean {
  const c = ctx.w.edgeControl[e];
  if (c < 0) return false;
  const ctrl = ctx.s.provinces[c].controller;
  return ctrl !== tag && atWar(ctx, tag, ctrl);
}

export function canNavyDock(ctx: Ctx, tag: Tag, p: number): boolean {
  const ps = ctx.s.provinces[p];
  if (!ctx.w.coastal[p]) return false;
  if (ps.controller === tag) return true;
  return ps.controller === ps.owner && hasAccess(ctx, tag, ps.owner) && !atWar(ctx, tag, ps.owner);
}

/** Bir sonraki düğüme adım atılabilir mi */
export function canStep(ctx: Ctx, a: Army, from: number, to: number): boolean {
  const { w } = ctx;
  const e = edgeIndex(w, from, to);
  if (e < 0) return false;
  const kind = w.edgeKind[e];
  if (a.isNavy) {
    if (to < w.P) return kind === EDGE_EMBARK && canNavyDock(ctx, a.owner, to);
    if (kind === EDGE_SEA && straitBlocked(ctx, a.owner, e)) return false;
    return true;
  }
  if (to >= w.P) {
    if (kind === EDGE_SEA && straitBlocked(ctx, a.owner, e)) return false;
    if (from < w.P && !canEmbark(ctx, a)) return false;
    return true;
  }
  if (kind === EDGE_LAND || kind === EDGE_CROSS || kind === EDGE_EMBARK) return canEnterProvince(ctx, a.owner, to);
  return false;
}

// ---------------------------------------------------------------------------
// Dijkstra
// ---------------------------------------------------------------------------
let bufN = 0;
let dist: Float64Array = new Float64Array(0);
let prev: Int32Array = new Int32Array(0);
let stamp: Int32Array = new Int32Array(0);
let epoch = 0;

function ensureBuffers(N: number) {
  if (bufN === N) return;
  bufN = N;
  dist = new Float64Array(N);
  prev = new Int32Array(N);
  stamp = new Int32Array(N);
  epoch = 0;
}

class MinHeap {
  keys: number[] = [];
  vals: number[] = [];
  push(k: number, v: number) {
    const ks = this.keys, vs = this.vals;
    let i = ks.length;
    ks.push(k);
    vs.push(v);
    while (i > 0) {
      const pi = (i - 1) >> 1;
      if (ks[pi] <= k) break;
      ks[i] = ks[pi];
      vs[i] = vs[pi];
      i = pi;
    }
    ks[i] = k;
    vs[i] = v;
  }
  pop(): [number, number] | null {
    const ks = this.keys, vs = this.vals;
    if (!ks.length) return null;
    const rk = ks[0], rv = vs[0];
    const lk = ks.pop()!, lv = vs.pop()!;
    if (ks.length) {
      let i = 0;
      const n = ks.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && ks[c + 1] < ks[c]) c++;
        if (ks[c] >= lk) break;
        ks[i] = ks[c];
        vs[i] = vs[c];
        i = c;
      }
      ks[i] = lk;
      vs[i] = lv;
    }
    return [rk, rv];
  }
  get size() {
    return this.keys.length;
  }
}

export interface PathResult {
  path: number[];
  days: number;
}

export interface PathOptions {
  /** en fazla bu kadar günlük yol (yapay zekâ aramalarını sınırlamak için) */
  maxDays?: number;
  /** deniz geçişine izin ver (kara orduları) */
  allowSea?: boolean;
  /** deniz nakliye kapasitesini yok say (yalnızca hata açıklaması için) */
  ignoreTransport?: boolean;
}

/**
 * Ordunun bulunduğu konumdan hedefe en kısa süreli rota.
 * Düşman tahkimatlı bölgeler hedef değilse geçilemez (bölge kontrolü).
 */
export function findPath(ctx: Ctx, a: Army, target: number, opts: PathOptions = {}): PathResult | null {
  const { w } = ctx;
  const start = a.location;
  if (start === target) return { path: [], days: 0 };
  ensureBuffers(w.N);
  epoch++;
  const allowSea = opts.allowSea !== false && (opts.ignoreTransport || canEmbark(ctx, a));
  const maxDays = opts.maxDays ?? Infinity;
  const speed = armyBaseSpeed(ctx, a);
  const heap = new MinHeap();
  dist[start] = 0;
  prev[start] = -1;
  stamp[start] = epoch;
  heap.push(0, start);
  const enterCache = new Map<number, boolean>();
  const canEnter = (p: number) => {
    let v = enterCache.get(p);
    if (v === undefined) {
      v = a.isNavy ? canNavyDock(ctx, a.owner, p) : canEnterProvince(ctx, a.owner, p);
      enterCache.set(p, v);
    }
    return v;
  };
  while (heap.size) {
    const top = heap.pop()!;
    const [d, u] = top;
    if (d > dist[u] || stamp[u] !== epoch) continue;
    if (u === target) break;
    if (d > maxDays) break;
    // Düşman kalesi: içinden geçilemez (başlangıç hariç)
    if (!a.isNavy && u < w.P && u !== start) {
      const ps = ctx.s.provinces[u];
      if (ps.controller !== a.owner && atWar(ctx, a.owner, ps.controller) && fortLevel(ctx, u) > 0) continue;
    }
    // Donanma limanda: limandan yalnızca denize çıkabilir
    for (let e = w.edgeStart[u]; e < w.edgeStart[u + 1]; e++) {
      const v = w.edgeTo[e];
      const kind = w.edgeKind[e];
      if (a.isNavy) {
        if (v < w.P) {
          if (kind !== EDGE_EMBARK || !canEnter(v)) continue;
          // limanlar arasında kara yoluyla geçiş yok
        } else if (kind === EDGE_SEA && straitBlocked(ctx, a.owner, e)) continue;
        if (u < w.P && v < w.P) continue;
      } else {
        if (v >= w.P) {
          if (!allowSea) continue;
          if (kind === EDGE_SEA && straitBlocked(ctx, a.owner, e)) continue;
        } else if (!canEnter(v)) continue;
      }
      const nd = d + edgeDays(ctx, a, e, speed);
      if (stamp[v] !== epoch || nd < dist[v]) {
        stamp[v] = epoch;
        dist[v] = nd;
        prev[v] = u;
        heap.push(nd, v);
      }
    }
  }
  if (stamp[target] !== epoch) return null;
  const path: number[] = [];
  for (let v = target; v !== start; v = prev[v]) {
    path.push(v);
    if (path.length > 5000) return null;
  }
  path.reverse();
  // Kara ordusu denizde bitemez
  if (!a.isNavy && target >= w.P) return null;
  return { path, days: dist[target] };
}

/** Tüm erişilebilir düğümlere süreler (yapay zekâ hedef seçimi için) */
export function reachable(ctx: Ctx, a: Army, maxDays: number, allowSea = false): Map<number, number> {
  const { w } = ctx;
  if (allowSea && !canEmbark(ctx, a)) allowSea = false;
  ensureBuffers(w.N);
  epoch++;
  const out = new Map<number, number>();
  const speed = armyBaseSpeed(ctx, a);
  const heap = new MinHeap();
  const start = a.location;
  dist[start] = 0;
  stamp[start] = epoch;
  heap.push(0, start);
  while (heap.size) {
    const [d, u] = heap.pop()!;
    if (d > dist[u] || stamp[u] !== epoch) continue;
    if (d > maxDays) break;
    out.set(u, d);
    if (!a.isNavy && u < w.P && u !== start) {
      const ps = ctx.s.provinces[u];
      if (ps.controller !== a.owner && atWar(ctx, a.owner, ps.controller) && fortLevel(ctx, u) > 0) continue;
    }
    for (let e = w.edgeStart[u]; e < w.edgeStart[u + 1]; e++) {
      const v = w.edgeTo[e];
      const kind = w.edgeKind[e];
      if (a.isNavy) {
        if (v < w.P && (kind !== EDGE_EMBARK || !canNavyDock(ctx, a.owner, v))) continue;
        if (u < w.P && v < w.P) continue;
        if (kind === EDGE_SEA && straitBlocked(ctx, a.owner, e)) continue;
      } else if (v >= w.P) {
        if (!allowSea) continue;
        if (kind === EDGE_SEA && straitBlocked(ctx, a.owner, e)) continue;
      } else if (!canEnterProvince(ctx, a.owner, v)) continue;
      const nd = d + edgeDays(ctx, a, e, speed);
      if (stamp[v] !== epoch || nd < dist[v]) {
        stamp[v] = epoch;
        dist[v] = nd;
        heap.push(nd, v);
      }
    }
  }
  return out;
}

/** Kalan rota süresi (gün) */
export function pathDays(ctx: Ctx, a: Army): number {
  const { w } = ctx;
  let cur = a.location;
  let days = -a.progress;
  const speed = armyBaseSpeed(ctx, a);
  for (const n of a.path) {
    const e = edgeIndex(w, cur, n);
    if (e < 0) break;
    days += edgeDays(ctx, a, e, speed);
    cur = n;
  }
  return Math.max(0, days);
}

/** En yakın dost bölge (geri çekilme ve yer değiştirme için) */
export function nearestFriendlyProvince(ctx: Ctx, tag: Tag, from: number, avoidHostile = true): number {
  const { w, s } = ctx;
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let depth = 0; depth < 60 && frontier.length; depth++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (let e = w.edgeStart[u]; e < w.edgeStart[u + 1]; e++) {
        const v = w.edgeTo[e];
        if (seen.has(v)) continue;
        seen.add(v);
        if (v < w.P) {
          const ps = s.provinces[v];
          const ok = ps.controller === tag || (isFriendly(ctx, tag, ps.controller) && ps.controller === ps.owner);
          if (ok) {
            if (!avoidHostile || !armiesAt(ctx, v).some((x) => x.owner !== tag && atWar(ctx, tag, x.owner))) return v;
          }
          if (ok || canEnterProvince(ctx, tag, v)) next.push(v);
        } else next.push(v);
      }
    }
    frontier = next;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Hareket turu
// ---------------------------------------------------------------------------
export interface MovementHooks {
  onArrive: (ctx: Ctx, a: Army, node: number) => boolean; // true → dur
}

export function movementTick(ctx: Ctx, dt: number, hooks: MovementHooks): void {
  const { w, s } = ctx;
  const ids = Object.keys(s.armies).sort();
  for (const id of ids) {
    const a = s.armies[id];
    if (!a || a.battle || !a.path.length) continue;
    let remaining = dt;
    const speed = armyBaseSpeed(ctx, a);
    while (remaining > 1e-9 && a.path.length) {
      const next = a.path[0];
      if (!canStep(ctx, a, a.location, next)) {
        a.path = [];
        a.progress = 0;
        if (a.owner === s.player) {
          notify(ctx, 'province', 'notif.moveBlocked', { army: a.name }, { severity: 'bad', involves: [a.owner], focus: { army: a.id } });
        }
        break;
      }
      const e = edgeIndex(w, a.location, next);
      const need = edgeDays(ctx, a, e, speed) - a.progress;
      if (remaining >= need) {
        remaining -= need;
        a.progress = 0;
        a.location = next;
        a.path.shift();
        invalidateArmies(ctx);
        if (hooks.onArrive(ctx, a, next)) break;
      } else {
        a.progress += remaining;
        remaining = 0;
      }
    }
    // Denizde mahsur kalan kara ordusu en yakın dost kıyıya yönelir
    if (!a.isNavy && a.location >= w.P && !a.path.length && !a.battle) {
      const home = nearestFriendlyProvince(ctx, a.owner, a.location, false);
      if (home >= 0) {
        const r = findPath(ctx, a, home);
        if (r) a.path = r.path;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// İkmal ve yıpranma
// ---------------------------------------------------------------------------
export function supplyLimit(ctx: Ctx, p: number, tag: Tag): number {
  const { s, w } = ctx;
  const ps = s.provinces[p];
  const terr = TERRAIN_DEFS[w.terrain[p]];
  const mods = getMods(ctx, tag);
  const b = ps.buildings;
  const base = (BAL.combatWidth[s.meta.era] ?? 60000) * 0.2 + ps.pop * 0.08;
  let own = 1;
  if (ps.controller !== tag) {
    if (isFriendly(ctx, tag, ps.controller)) own = 0.85;
    else if (atWar(ctx, tag, ps.controller)) own = 0.55;
    else own = 0.75;
  }
  return base * terr.supply * (1 + 0.2 * b[B_ROAD] + 0.15 * b[B_PORT] + 0.1 * b[B_MIL]) * Math.max(0.3, 1 + mods.supply) * own;
}

export function supplyTick(ctx: Ctx, dt: number): void {
  const { w, s } = ctx;
  const byNode = new Map<number, Map<Tag, Army[]>>();
  for (const a of Object.values(s.armies)) {
    if (a.isNavy) continue;
    let m = byNode.get(a.location);
    if (!m) byNode.set(a.location, (m = new Map()));
    let arr = m.get(a.owner);
    if (!arr) m.set(a.owner, (arr = []));
    arr.push(a);
  }
  const frac = dt / DAYS_PER_MONTH;
  let changed = false;
  for (const [node, owners] of byNode) {
    for (const [tag, list] of owners) {
      const mods = getMods(ctx, tag);
      const total = list.reduce((n, a) => n + armySoldiers(a), 0);
      let rate = 0;
      let supply = 1;
      if (node >= w.P) {
        rate = 0.02;
        supply = 0.5;
      } else {
        const lim = supplyLimit(ctx, node, tag);
        supply = Math.min(1, lim / Math.max(1, total));
        const terr = TERRAIN_DEFS[w.terrain[node]];
        const ownLand = s.provinces[node].controller === tag;
        rate = terr.attrition * (ownLand ? 0.4 : 1);
        if (total > lim) rate += 0.04 * Math.min(3, total / lim - 1);
      }
      rate *= Math.max(0.1, 1 + mods.attrition);
      for (const a of list) {
        a.supply = supply;
        if (rate <= 0) continue;
        const loss = rate * frac;
        for (const t of UNIT_ORDER) {
          if (t === 'navy' || !a.units[t]) continue;
          a.units[t] = Math.max(0, Math.floor(a.units[t] * (1 - loss)));
        }
        changed = true;
      }
    }
  }
  // Moral toparlanması (savaşta olmayan ordular)
  for (const a of Object.values(s.armies)) {
    if (a.battle) continue;
    const mods = getMods(ctx, a.owner);
    const max = Math.min(1.2, Math.max(0.3, 1 + mods.morale));
    const inOwn = a.location < w.P && s.provinces[a.location].controller === a.owner;
    const rec = (inOwn ? 0.12 : 0.06) * Math.max(0.2, 1 + mods.moraleRecovery) * frac * (0.5 + 0.5 * a.supply);
    if (a.morale < max) a.morale = Math.min(max, a.morale + rec * 3);
    else if (a.morale > max) a.morale = max;
  }
  if (changed) {
    for (const a of Object.values(s.armies)) {
      if (!a.isNavy && armySoldiers(a) < 50 && !a.battle) {
        delete s.armies[a.id];
        changed = true;
      }
    }
    invalidateArmies(ctx);
  }
}

export { hostileArmies };
