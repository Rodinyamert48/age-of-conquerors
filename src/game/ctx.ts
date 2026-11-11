/**
 * Oyun bağlamı: dünya + durum + serileştirilmeyen önbellekler.
 * Önbellekler sürüm sayaçlarıyla geçersiz kılınır; durum değiştiren kod ilgili `invalidate*` çağrısını yapar.
 */
import type { Alliance, Army, GameState, Modifiers, Tag, Treaty, War } from './types';
import type { World } from './world';
import { computeModifiers } from './modifiers';

export interface Cache {
  modKeys: Map<Tag, string>;
  mods: Map<Tag, Modifiers>;
  provByOwner: Map<Tag, number[]> | null;
  provByController: Map<Tag, number[]> | null;
  armiesAt: Map<number, Army[]> | null;
  armiesByOwner: Map<Tag, Army[]> | null;
  treatyIndex: Map<string, Treaty> | null;
  allianceOf: Map<Tag, Alliance> | null;
  warsOf: Map<Tag, War[]> | null;
  /** ülkeler arası komşuluk (kara sınırı) */
  neighborCountries: Map<Tag, Set<Tag>> | null;
  power: Map<Tag, number> | null;
}

export interface Ctx {
  w: World;
  s: GameState;
  cache: Cache;
}

export function emptyCache(): Cache {
  return {
    modKeys: new Map(),
    mods: new Map(),
    provByOwner: null,
    provByController: null,
    armiesAt: null,
    armiesByOwner: null,
    treatyIndex: null,
    allianceOf: null,
    warsOf: null,
    neighborCountries: null,
    power: null,
  };
}

export function makeCtx(w: World, s: GameState): Ctx {
  return { w, s, cache: emptyCache() };
}

// ---------------------------------------------------------------------------
// Geçersiz kılma
// ---------------------------------------------------------------------------
export function invalidateOwnership(ctx: Ctx): void {
  ctx.cache.provByOwner = null;
  ctx.cache.provByController = null;
  ctx.cache.neighborCountries = null;
  ctx.cache.power = null;
  ctx.s.versions.owners++;
}

export function invalidateControl(ctx: Ctx): void {
  ctx.cache.provByController = null;
  ctx.s.versions.owners++;
}

export function invalidateArmies(ctx: Ctx): void {
  ctx.cache.armiesAt = null;
  ctx.cache.armiesByOwner = null;
  ctx.cache.power = null;
  ctx.s.versions.armies++;
}

export function invalidateDiplomacy(ctx: Ctx): void {
  ctx.cache.treatyIndex = null;
  ctx.cache.allianceOf = null;
  ctx.cache.warsOf = null;
}

export function invalidateAll(ctx: Ctx): void {
  ctx.cache = emptyCache();
}

// ---------------------------------------------------------------------------
// Dizinler
// ---------------------------------------------------------------------------
export function provincesOf(ctx: Ctx, tag: Tag): number[] {
  if (!ctx.cache.provByOwner) {
    const m = new Map<Tag, number[]>();
    ctx.s.provinces.forEach((p, i) => {
      let arr = m.get(p.owner);
      if (!arr) m.set(p.owner, (arr = []));
      arr.push(i);
    });
    ctx.cache.provByOwner = m;
  }
  return ctx.cache.provByOwner.get(tag) ?? [];
}

export function provincesControlledBy(ctx: Ctx, tag: Tag): number[] {
  if (!ctx.cache.provByController) {
    const m = new Map<Tag, number[]>();
    ctx.s.provinces.forEach((p, i) => {
      let arr = m.get(p.controller);
      if (!arr) m.set(p.controller, (arr = []));
      arr.push(i);
    });
    ctx.cache.provByController = m;
  }
  return ctx.cache.provByController.get(tag) ?? [];
}

export function armiesAt(ctx: Ctx, node: number): Army[] {
  if (!ctx.cache.armiesAt) {
    const m = new Map<number, Army[]>();
    for (const a of Object.values(ctx.s.armies)) {
      let arr = m.get(a.location);
      if (!arr) m.set(a.location, (arr = []));
      arr.push(a);
    }
    ctx.cache.armiesAt = m;
  }
  return ctx.cache.armiesAt.get(node) ?? [];
}

export function armiesOf(ctx: Ctx, tag: Tag): Army[] {
  if (!ctx.cache.armiesByOwner) {
    const m = new Map<Tag, Army[]>();
    for (const a of Object.values(ctx.s.armies)) {
      let arr = m.get(a.owner);
      if (!arr) m.set(a.owner, (arr = []));
      arr.push(a);
    }
    ctx.cache.armiesByOwner = m;
  }
  return ctx.cache.armiesByOwner.get(tag) ?? [];
}

export function treatyKey(type: string, a: Tag, b: Tag): string {
  return `${type}|${a}|${b}`;
}

/** Simetrik antlaşmalar alfabetik anahtarla da indekslenir */
const SYMMETRIC = new Set(['nap', 'defensive', 'trade', 'truce']);

export function findTreaty(ctx: Ctx, type: Treaty['type'], a: Tag, b: Tag): Treaty | undefined {
  if (!ctx.cache.treatyIndex) {
    const m = new Map<string, Treaty>();
    for (const t of ctx.s.treaties) {
      m.set(treatyKey(t.type, t.a, t.b), t);
      if (SYMMETRIC.has(t.type)) m.set(treatyKey(t.type, t.b, t.a), t);
    }
    ctx.cache.treatyIndex = m;
  }
  return ctx.cache.treatyIndex.get(treatyKey(type, a, b));
}

export function allianceOf(ctx: Ctx, tag: Tag): Alliance | undefined {
  if (!ctx.cache.allianceOf) {
    const m = new Map<Tag, Alliance>();
    for (const al of Object.values(ctx.s.alliances)) for (const t of al.members) m.set(t, al);
    ctx.cache.allianceOf = m;
  }
  return ctx.cache.allianceOf.get(tag);
}

export function warsOf(ctx: Ctx, tag: Tag): War[] {
  if (!ctx.cache.warsOf) {
    const m = new Map<Tag, War[]>();
    for (const w of Object.values(ctx.s.wars)) {
      for (const t of [...w.attackers, ...w.defenders]) {
        let arr = m.get(t);
        if (!arr) m.set(t, (arr = []));
        arr.push(w);
      }
    }
    ctx.cache.warsOf = m;
  }
  return ctx.cache.warsOf.get(tag) ?? [];
}

/** Kara sınırı paylaşan ülkeler (boğaz geçişleri dahil) */
export function neighborCountries(ctx: Ctx, tag: Tag): Set<Tag> {
  if (!ctx.cache.neighborCountries) {
    const m = new Map<Tag, Set<Tag>>();
    const { w, s } = ctx;
    for (let i = 0; i < w.P; i++) {
      const o = s.provinces[i].owner;
      for (let e = w.edgeStart[i]; e < w.edgeStart[i + 1]; e++) {
        const j = w.edgeTo[e];
        if (j >= w.P) continue;
        const o2 = s.provinces[j].owner;
        if (o2 === o) continue;
        let set = m.get(o);
        if (!set) m.set(o, (set = new Set()));
        set.add(o2);
      }
    }
    ctx.cache.neighborCountries = m;
  }
  return ctx.cache.neighborCountries.get(tag) ?? new Set();
}

export function getMods(ctx: Ctx, tag: Tag): Modifiers {
  const c = ctx.s.countries[tag];
  const key = c
    ? `${c.techs.length}|${Object.values(c.policies).join('')}|${c.government}|${c.tempMods.map((m) => m.id).join(',')}|${c.isPlayer ? 1 : 0}|${ctx.s.rules.difficulty}`
    : 'none';
  if (ctx.cache.modKeys.get(tag) !== key || !ctx.cache.mods.has(tag)) {
    ctx.cache.mods.set(tag, computeModifiers(ctx.s, tag));
    ctx.cache.modKeys.set(tag, key);
  }
  return ctx.cache.mods.get(tag)!;
}
