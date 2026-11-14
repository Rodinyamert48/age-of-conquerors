/**
 * Generaller: orduya atanan komutanlar. Her birinin bir uzmanlığı vardır; savaş kazandıkça
 * seviye atlar, yenilgide ölebilirler.
 */
import type { Ctx } from './ctx';
import type { Army, General, Modifiers, Tag } from './types';
import { FIRST, LAST } from './ministers';
import { chance, hashString } from './rng';
import { notify, newId } from './notify';

export interface GeneralTrait {
  id: string;
  name: { tr: string; en: string };
  mods: Partial<Modifiers>;
  minus: Partial<Modifiers>;
}

const G = (id: string, tr: string, en: string, mods: Partial<Modifiers>, minus: Partial<Modifiers>): GeneralTrait => ({ id, name: { tr, en }, mods, minus });

export const GENERAL_TRAITS: GeneralTrait[] = [
  G('aggressive', 'Taarruz Ustası', 'Offensive Master', { infantryPower: 0.12 }, { attrition: 0.1 }),
  G('steadfast', 'Sarsılmaz', 'Steadfast', { morale: 0.1, fortDefense: 0.15 }, { moveSpeed: -0.05 }),
  G('logistics', 'Lojistikçi', 'Logistician', { supply: 0.2, attrition: -0.2 }, { infantryPower: -0.03 }),
  G('besieger', 'Kuşatmacı', 'Besieger', { siegeSpeed: 0.2, siegePower: 0.15 }, { morale: -0.03 }),
  G('charismatic', 'Karizmatik', 'Charismatic', { morale: 0.08, moraleRecovery: 0.2 }, { infantryPower: -0.02 }),
  G('reckless', 'Gözü Kara', 'Reckless', { infantryPower: 0.18 }, { morale: -0.06, attrition: 0.15 }),
];

export const GENERAL_LIMIT = 5;
export const GENERAL_MAX_LEVEL = 5;

export function traitDef(id: string): GeneralTrait | undefined {
  return GENERAL_TRAITS.find((t) => t.id === id);
}

export function generalCost(ctx: Ctx, tag: Tag): number {
  const c = ctx.s.countries[tag];
  return Math.max(0.05, c?.budget.income ?? 0) * (1 + (c?.generals?.length ?? 0));
}

export function generalOf(ctx: Ctx, a: Army): General | undefined {
  return ctx.s.countries[a.owner]?.generals?.find((g) => g.army === a.id);
}

/** Generalin orduya kattığı etki: uzmanlık (seviyeyle büyür) + seviye başına %3 güç */
export function generalMods(g: General): Partial<Modifiers> {
  const tr = traitDef(g.trait);
  const out: Partial<Modifiers> = { infantryPower: 0.03 * g.level };
  if (!tr) return out;
  const k = 1 + (g.level - 1) * 0.25;
  for (const [key, v] of Object.entries(tr.mods)) out[key as keyof Modifiers] = (out[key as keyof Modifiers] ?? 0) + (v as number) * k;
  for (const [key, v] of Object.entries(tr.minus)) out[key as keyof Modifiers] = (out[key as keyof Modifiers] ?? 0) + (v as number);
  return out;
}

export function hireGeneral(ctx: Ctx, tag: Tag): { ok: boolean; error?: string } {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c?.alive) return { ok: false, error: 'err.invalidTarget' };
  c.generals ??= [];
  if (c.generals.length >= GENERAL_LIMIT) return { ok: false, error: 'general.limit' };
  const cost = generalCost(ctx, tag);
  if (c.treasury < cost) return { ok: false, error: 'err.noMoney' };
  c.treasury -= cost;
  const id = newId(ctx, 'g');
  const h = hashString(`${tag}|${id}|${s.meta.seed}`);
  c.generals.push({ id, name: `${FIRST[h % FIRST.length]} ${LAST[(h >>> 7) % LAST.length]}`, trait: GENERAL_TRAITS[(h >>> 3) % GENERAL_TRAITS.length].id, level: 1, xp: 0, army: null });
  return { ok: true };
}

export function assignGeneral(ctx: Ctx, tag: Tag, generalId: string, armyId: string | null): { ok: boolean; error?: string } {
  const s = ctx.s;
  const c = s.countries[tag];
  const g = c?.generals?.find((x) => x.id === generalId);
  if (!g) return { ok: false, error: 'err.notFound' };
  if (armyId !== null) {
    const a = s.armies[armyId];
    if (!a || a.owner !== tag) return { ok: false, error: 'err.notFound' };
    for (const other of c.generals!) if (other.army === armyId) other.army = null;
  }
  g.army = armyId;
  return { ok: true };
}

export function dismissGeneral(ctx: Ctx, tag: Tag, generalId: string): { ok: boolean; error?: string } {
  const c = ctx.s.countries[tag];
  if (!c?.generals?.some((g) => g.id === generalId)) return { ok: false, error: 'err.notFound' };
  c.generals = c.generals.filter((g) => g.id !== generalId);
  return { ok: true };
}

/** Muharebe sonu: kazanan generaller tecrübe kazanır, kaybedenler ölebilir */
export function generalsAfterBattle(ctx: Ctx, winners: Army[], losers: Army[]): void {
  const s = ctx.s;
  for (const a of winners) {
    const g = generalOf(ctx, a);
    if (!g) continue;
    g.xp += 1;
    if (g.level < GENERAL_MAX_LEVEL && g.xp >= g.level * 2) {
      g.xp = 0;
      g.level += 1;
      notify(ctx, 'battle', 'notif.generalLevel', { general: g.name, level: g.level }, { involves: [a.owner], severity: 'good' });
    }
  }
  for (const a of losers) {
    const g = generalOf(ctx, a);
    if (!g) continue;
    if (chance(s, 0.12)) {
      const c = s.countries[a.owner];
      c.generals = c.generals!.filter((x) => x !== g);
      notify(ctx, 'battle', 'notif.generalDied', { general: g.name }, { involves: [a.owner], severity: 'bad' });
    }
  }
}

/** Ordusu yok olan generaller yedeğe döner */
export function generalsCleanup(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!c.generals) continue;
    for (const g of c.generals) if (g.army && !s.armies[g.army]) g.army = null;
  }
}
