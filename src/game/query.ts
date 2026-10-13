/**
 * Durum sorguları: ilişkiler, savaş durumu, erişim hakları, güç hesapları.
 */
import type { Army, Country, GameState, Tag, War } from './types';
import { allianceOf, armiesOf, findTreaty, provincesOf, warsOf, type Ctx } from './ctx';
import { UNIT_DEFS, UNIT_ORDER, UNIT_POWER_MOD } from './defs/units';
import { getMods } from './ctx';

export const REBEL_TAG = 'REB';

export function relKey(a: Tag, b: Tag): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relation(s: GameState, a: Tag, b: Tag): number {
  if (a === b) return 100;
  return s.relations[relKey(a, b)] ?? 0;
}

export function setRelation(s: GameState, a: Tag, b: Tag, v: number): void {
  if (a === b) return;
  const val = Math.max(-100, Math.min(100, v));
  const k = relKey(a, b);
  if (Math.abs(val) < 0.5) delete s.relations[k];
  else s.relations[k] = Math.round(val * 10) / 10;
}

export function addRelation(s: GameState, a: Tag, b: Tag, d: number): void {
  setRelation(s, a, b, relation(s, a, b) + d);
}

export function warSide(w: War, tag: Tag): 'attackers' | 'defenders' | null {
  if (w.attackers.includes(tag)) return 'attackers';
  if (w.defenders.includes(tag)) return 'defenders';
  return null;
}

export function enemiesIn(w: War, tag: Tag): Tag[] {
  const side = warSide(w, tag);
  if (side === 'attackers') return w.defenders;
  if (side === 'defenders') return w.attackers;
  return [];
}

export function alliesIn(w: War, tag: Tag): Tag[] {
  const side = warSide(w, tag);
  if (side === 'attackers') return w.attackers;
  if (side === 'defenders') return w.defenders;
  return [];
}

export function warBetween(ctx: Ctx, a: Tag, b: Tag): War | undefined {
  for (const w of warsOf(ctx, a)) {
    const sa = warSide(w, a);
    const sb = warSide(w, b);
    if (sa && sb && sa !== sb) return w;
  }
  return undefined;
}

export function atWar(ctx: Ctx, a: Tag, b: Tag): boolean {
  if (a === b) return false;
  return !!warBetween(ctx, a, b);
}

export function isAtWar(ctx: Ctx, tag: Tag): boolean {
  return warsOf(ctx, tag).length > 0;
}

export function enemiesOf(ctx: Ctx, tag: Tag): Set<Tag> {
  const out = new Set<Tag>();
  for (const w of warsOf(ctx, tag)) for (const t of enemiesIn(w, tag)) out.add(t);
  return out;
}

export function overlordOf(ctx: Ctx, tag: Tag): Tag | null {
  for (const t of ctx.s.treaties) if (t.type === 'vassal' && t.b === tag) return t.a;
  return null;
}

export function vassalsOf(ctx: Ctx, tag: Tag): Tag[] {
  return ctx.s.treaties.filter((t) => t.type === 'vassal' && t.a === tag).map((t) => t.b);
}

export function sameAlliance(ctx: Ctx, a: Tag, b: Tag): boolean {
  const al = allianceOf(ctx, a);
  return !!al && al.members.includes(b);
}

/** Dost: aynı ittifak, efendi-bağlı ilişkisi veya aynı savaşta aynı taraf */
export function isFriendly(ctx: Ctx, a: Tag, b: Tag): boolean {
  if (a === b) return true;
  if (sameAlliance(ctx, a, b)) return true;
  if (findTreaty(ctx, 'vassal', a, b) || findTreaty(ctx, 'vassal', b, a)) return true;
  for (const w of warsOf(ctx, a)) {
    const sa = warSide(w, a);
    if (sa && sa === warSide(w, b)) return true;
  }
  return false;
}

/** a ülkesinin b ülkesi topraklarından geçiş hakkı var mı */
export function hasAccess(ctx: Ctx, a: Tag, b: Tag): boolean {
  if (a === b) return true;
  if (isFriendly(ctx, a, b)) return true;
  return !!findTreaty(ctx, 'access', b, a);
}

/** Bir bölgeye girebilir mi (kara orduları) */
export function canEnterProvince(ctx: Ctx, tag: Tag, p: number): boolean {
  const ps = ctx.s.provinces[p];
  if (ps.owner === tag || ps.controller === tag) return true;
  if (atWar(ctx, tag, ps.owner) || atWar(ctx, tag, ps.controller)) return true;
  if (hasAccess(ctx, tag, ps.controller) && hasAccess(ctx, tag, ps.owner)) return true;
  // İsyancılarla savaşan ülke, isyancıların tuttuğu bölgeye girebilir
  if (ps.controller === REBEL_TAG && ps.owner === tag) return true;
  return false;
}

/** İki ordu sahibi birbirine düşman mı */
export function hostileArmies(ctx: Ctx, a: Army, b: Army): boolean {
  if (a.owner === b.owner) return false;
  // İsyanlar da gerçek savaş kaydı oluşturur; düşmanlık her zaman savaş durumundan okunur
  return atWar(ctx, a.owner, b.owner);
}

export function armySoldiers(a: Army): number {
  let n = 0;
  for (const t of UNIT_ORDER) if (t !== 'navy') n += a.units[t];
  return n;
}

export function armyShips(a: Army): number {
  return a.units.navy;
}

export function armySize(a: Army): number {
  return a.isNavy ? a.units.navy : armySoldiers(a);
}

/** Basit güç ölçüsü (yapay zekâ ve tahminler için) */
export function armyPower(ctx: Ctx, a: Army): number {
  const mods = getMods(ctx, a.owner);
  let p = 0;
  for (const t of UNIT_ORDER) {
    const n = a.units[t];
    if (!n) continue;
    const def = UNIT_DEFS[t];
    const per = t === 'navy' ? n : n / 1000;
    p += per * ((def.attack + def.defense) / 2) * (1 + mods[UNIT_POWER_MOD[t]]);
  }
  return p * (0.5 + 0.5 * a.morale) * (1 + 0.5 * a.experience);
}

export function landPower(ctx: Ctx, tag: Tag): number {
  if (!ctx.cache.power) ctx.cache.power = new Map();
  const cached = ctx.cache.power.get(tag);
  if (cached !== undefined) return cached;
  let p = 0;
  for (const a of armiesOf(ctx, tag)) if (!a.isNavy) p += armyPower(ctx, a);
  ctx.cache.power.set(tag, p);
  return p;
}

export function navalPower(ctx: Ctx, tag: Tag): number {
  let p = 0;
  for (const a of armiesOf(ctx, tag)) if (a.isNavy) p += armyPower(ctx, a);
  return p;
}

export function totalOutput(ctx: Ctx, tag: Tag): number {
  let o = 0;
  for (const p of provincesOf(ctx, tag)) o += ctx.s.provinces[p].output;
  return o;
}

export function totalPop(ctx: Ctx, tag: Tag): number {
  let o = 0;
  for (const p of provincesOf(ctx, tag)) o += ctx.s.provinces[p].pop;
  return o;
}

export function aliveCountries(s: GameState): Country[] {
  return Object.values(s.countries).filter((c) => c.alive && c.tag !== REBEL_TAG);
}

export function countryName(s: GameState, tag: Tag): string {
  return s.countries[tag]?.name ?? tag;
}

export function isPlayer(s: GameState, tag: Tag): boolean {
  return s.player === tag;
}

export function fortLevel(ctx: Ctx, p: number): number {
  const ps = ctx.s.provinces[p];
  const c = ctx.s.countries[ps.owner];
  return ps.buildings[7] + (c && c.capital === p ? 1 : 0);
}

/** Bir ülkenin askerî potansiyeli: ordu + ekonomi ağırlıklı */
export function strategicStrength(ctx: Ctx, tag: Tag): number {
  return landPower(ctx, tag) + Math.sqrt(Math.max(0, totalOutput(ctx, tag))) * 0.5;
}
