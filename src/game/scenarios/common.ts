/**
 * Senaryo kurulumunda ortak yardımcılar: üretim dağılımı, başlangıç binaları, ordu yerleşimi.
 */
import type { ArmyUnits, Tag, UnitType } from '../types';
import { BUILDING_IDS } from '../types';
import { BUILDING_DEFS } from '../defs/buildings';
import type { World } from '../world';

export function provincesByOwner(owner: Tag[]): Map<Tag, number[]> {
  const m = new Map<Tag, number[]>();
  owner.forEach((t, i) => {
    if (!m.has(t)) m.set(t, []);
    m.get(t)!.push(i);
  });
  return m;
}

export function ownerNeighbors(world: World, owner: Tag[]): Map<Tag, Set<Tag>> {
  const m = new Map<Tag, Set<Tag>>();
  for (let i = 0; i < world.P; i++) {
    const a = owner[i];
    for (const j of world.data.provinces[i].adj) {
      const b = owner[j];
      if (a === b) continue;
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    }
  }
  return m;
}

/** Bir ülkenin başkenti: dünya verisindeki başkent şehri; yoksa en kalabalık bölge */
export function findCapital(world: World, provs: number[], a3: string, pop: number[]): number {
  const cap = provs.find((p) => world.data.provinces[p].city?.capital && world.data.provinces[p].a3 === a3);
  if (cap !== undefined) return cap;
  let best = provs[0];
  for (const p of provs) if (pop[p] > pop[best]) best = p;
  return best;
}

/** Ülke/bölge GSYH'sini bölgelere dağıt: kentsel nüfus daha üretken kabul edilir */
export function distributeOutput(world: World, provs: number[], total: number, pop: number[], urbanShare: (p: number) => number): Map<number, number> {
  const out = new Map<number, number>();
  let wsum = 0;
  const ws = provs.map((p) => {
    const w = pop[p] * (1 + 1.5 * urbanShare(p));
    wsum += w;
    return w;
  });
  provs.forEach((p, i) => out.set(p, wsum > 0 ? (total * ws[i]) / wsum : total / provs.length));
  void world;
  return out;
}

export type IncomeTier = 'high' | 'upper' | 'lower' | 'low';

function allowed(world: World, p: number, id: (typeof BUILDING_IDS)[number], level: number, pop: number, popScale: number): number {
  const def = BUILDING_DEFS[id];
  const terr = world.terrain[p];
  if (def.forbiddenTerrain?.includes(terr)) return 0;
  if (def.coastal && !world.coastal[p]) return 0;
  let lv = Math.min(level, def.maxLevel);
  while (lv > 0) {
    const mp = def.minPop?.[lv - 1];
    if (!mp || pop >= mp * popScale) break;
    lv--;
  }
  return Math.max(0, lv);
}

/**
 * Gelir düzeyine ve kentleşmeye göre başlangıç binaları.
 * techCap: dönem teknolojisinin izin verdiği en yüksek seviye (bina başına).
 */
export function defaultBuildings(
  world: World,
  provs: number[],
  tier: IncomeTier,
  pop: number[],
  urban: (p: number) => number,
  capital: number,
  popScale: number,
  techCap: Partial<Record<(typeof BUILDING_IDS)[number], number>> = {},
): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const ranked = [...provs].sort((a, b) => pop[b] - pop[a]);
  const rankOf = new Map<number, number>();
  ranked.forEach((p, i) => rankOf.set(p, ranked.length > 1 ? i / (ranked.length - 1) : 0));
  const T = { high: 3, upper: 2, lower: 1, low: 0 }[tier];
  for (const p of provs) {
    const r = rankOf.get(p) ?? 1;
    const u = urban(p) / popScale;
    const wp = world.data.provinces[p];
    const lv: Record<(typeof BUILDING_IDS)[number], number> = {
      agriculture: T >= 3 ? 2 : T === 2 ? (wp.res[0] >= 2 ? 2 : 1) : T === 1 ? 1 : wp.res[0] >= 2 ? 1 : 0,
      industry: T >= 3 ? (r < 0.1 ? 3 : r < 0.5 ? 2 : 1) : T === 2 ? (r < 0.3 ? 2 : r < 0.7 ? 1 : 0) : T === 1 ? (r < 0.5 ? 1 : 0) : r < 0.15 ? 1 : 0,
      trade: (u > 2_000_000 ? 3 : u > 700_000 ? 2 : u > 200_000 ? 1 : 0) - (T === 0 ? 1 : 0),
      port: wp.coastal ? (u > 500_000 ? 2 : u > 100_000 || p === capital ? 1 : 0) + (T >= 3 ? 1 : 0) : 0,
      road: T >= 3 ? (u > 1_000_000 ? 3 : 2) : T === 2 ? (u > 500_000 ? 2 : 1) : T === 1 ? (u > 100_000 ? 1 : 0) : u > 500_000 ? 1 : 0,
      university: (u > 3_000_000 ? 2 : u > 800_000 ? 1 : 0) - (T === 0 && u < 2_000_000 ? 1 : 0),
      military: p === capital ? (T >= 2 ? 2 : 1) : 0,
      fort: p === capital ? 1 : 0,
    };
    if (p === capital) {
      lv.university = Math.max(lv.university, T >= 1 ? 1 : 0);
      lv.road = Math.max(lv.road, 1);
    }
    const arr = BUILDING_IDS.map((id) => {
      const cap = techCap[id] ?? 3;
      return allowed(world, p, id, Math.max(0, Math.min(cap, lv[id])), pop[p], popScale);
    });
    out.set(p, arr);
  }
  return out;
}

export function unitMix(tier: IncomeTier, available: (u: UnitType) => boolean): [UnitType, number][] {
  const base: Record<IncomeTier, [UnitType, number][]> = {
    high: [['infantry', 0.5], ['light', 0.12], ['artillery', 0.12], ['armor', 0.14], ['air', 0.12]],
    upper: [['infantry', 0.58], ['light', 0.1], ['artillery', 0.13], ['armor', 0.12], ['air', 0.07]],
    lower: [['infantry', 0.65], ['light', 0.1], ['artillery', 0.12], ['armor', 0.08], ['air', 0.05]],
    low: [['infantry', 0.75], ['light', 0.12], ['artillery', 0.08], ['armor', 0.03], ['air', 0.02]],
  };
  const mix = base[tier].filter(([u]) => available(u));
  const tot = mix.reduce((s, [, v]) => s + v, 0);
  return mix.map(([u, v]) => [u, v / tot]);
}

/** Toplam askeri birkaç orduya bölüp başkent ve sınır bölgelerine yerleştir */
export function placeArmies(
  world: World,
  owner: Tag[],
  tag: Tag,
  provs: number[],
  capital: number,
  soldiers: number,
  mix: [UnitType, number][],
  threats: Tag[],
  pop: number[],
): { province: number; units: Partial<ArmyUnits> }[] {
  if (soldiers < 1000) return [];
  const groups = soldiers >= 600_000 ? 5 : soldiers >= 250_000 ? 4 : soldiers >= 100_000 ? 3 : soldiers >= 30_000 ? 2 : 1;
  const sites: number[] = [capital];
  const threatSet = new Set(threats);
  const border = provs.filter((p) => world.data.provinces[p].adj.some((j) => threatSet.has(owner[j])));
  border.sort((a, b) => pop[b] - pop[a]);
  for (const p of border) {
    if (sites.length >= groups) break;
    if (!sites.includes(p)) sites.push(p);
  }
  const rest = [...provs].sort((a, b) => pop[b] - pop[a]);
  for (const p of rest) {
    if (sites.length >= groups) break;
    if (!sites.includes(p)) sites.push(p);
  }
  void tag;
  const share = 1 / sites.length;
  return sites.map((province) => {
    const units: Partial<ArmyUnits> = {};
    for (const [u, f] of mix) {
      const n = Math.round((soldiers * share * f) / 1000) * 1000;
      if (n > 0) units[u] = n;
    }
    return { province, units };
  });
}

/** Simetrik ikili antlaşma listesi üret */
export function pairwise(tags: Tag[]): [Tag, Tag][] {
  const out: [Tag, Tag][] = [];
  for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) out.push([tags[i], tags[j]]);
  return out;
}
