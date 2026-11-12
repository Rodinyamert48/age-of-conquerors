/**
 * Nükleer silahlar: üretim ve kullanım. Başlık yalnızca t_nuclear teknolojisi olan ülkelerde üretilebilir;
 * kullanım yalnızca savaşta olunan bir ülkenin bölgesine yapılır ve ağır diplomatik bedeli vardır.
 */
import type { Ctx } from './ctx';
import { armiesAt, invalidateArmies, provincesOf } from './ctx';
import type { Tag } from './types';
import { atWar, REBEL_TAG } from './query';
import { addRelation } from './query';
import { notify } from './notify';
import { spend, canAfford } from './economy';
import { provinceValue } from './war';
import { NUCLEAR_TECH } from './defs/techs';

export const NUKE_COST_FACTOR = 30;

export function hasNuclearTech(ctx: Ctx, tag: Tag): boolean {
  return !!ctx.s.countries[tag]?.techs.includes(NUCLEAR_TECH);
}

/** Bir başlığın maliyeti (ortalama bölge üretiminin katı) */
export function nukeCost(ctx: Ctx): number {
  return ctx.s.meta.avgProvinceOutput * NUKE_COST_FACTOR;
}

export function buildNuke(ctx: Ctx, tag: Tag): { ok: boolean; error?: string } {
  const c = ctx.s.countries[tag];
  if (!c || !hasNuclearTech(ctx, tag)) return { ok: false, error: 'nuke.needsTech' };
  const cost = nukeCost(ctx);
  if (!canAfford(ctx, tag, cost)) return { ok: false, error: 'err.noMoney' };
  spend(ctx, tag, cost, 'recruitment');
  c.nukes = (c.nukes ?? 0) + 1;
  return { ok: true };
}

export function canNuke(ctx: Ctx, tag: Tag, province: number): { ok: boolean; error?: string } {
  const s = ctx.s;
  const c = s.countries[tag];
  const ps = s.provinces[province];
  if (!c || !ps) return { ok: false, error: 'err.invalidTarget' };
  if ((c.nukes ?? 0) < 1) return { ok: false, error: 'nuke.noStock' };
  const victim = ps.controller === REBEL_TAG ? ps.owner : ps.controller;
  if (victim === tag || ps.owner === tag) return { ok: false, error: 'nuke.ownLand' };
  if (!atWar(ctx, tag, victim) && !atWar(ctx, tag, ps.owner)) return { ok: false, error: 'nuke.needsWar' };
  return { ok: true };
}

/** Bölgeyi vurur: ordular yok olur, nüfus ve üretim çöker, binalar zarar görür */
export function launchNuke(ctx: Ctx, tag: Tag, province: number): { ok: boolean; error?: string } {
  const chk = canNuke(ctx, tag, province);
  if (!chk.ok) return chk;
  const { s, w } = ctx;
  const c = s.countries[tag];
  const ps = s.provinces[province];
  const victimTag = ps.owner;
  c.nukes = (c.nukes ?? 0) - 1;
  for (const a of armiesAt(ctx, province)) delete s.armies[a.id];
  invalidateArmies(ctx);
  ps.pop *= 0.55;
  ps.output *= 0.45;
  ps.unrest = Math.min(100, ps.unrest + 40);
  ps.siege = null;
  for (let i = 0; i < ps.buildings.length; i++) ps.buildings[i] = Math.max(0, ps.buildings[i] - 1);
  ps.construction = null;
  ps.recruits = [];
  for (const n of w.data.provinces[province].adj) {
    const nb = s.provinces[n];
    if (nb) nb.unrest = Math.min(100, nb.unrest + 10);
  }
  // Diplomatik sonuçlar
  c.reputation = Math.max(-100, c.reputation - 40);
  c.stability = Math.max(0, c.stability - 5);
  for (const o of Object.values(s.countries)) {
    if (!o.alive || o.tag === tag || o.tag === REBEL_TAG) continue;
    addRelation(s, o.tag, tag, o.tag === victimTag ? -60 : -25);
  }
  const vc = s.countries[victimTag];
  if (vc) vc.stability = Math.max(0, vc.stability - 8);
  notify(
    ctx,
    'war',
    'notif.nukeLaunched',
    { attacker: c.name, province: w.data.provinces[province].name, defender: vc?.name ?? victimTag },
    { severity: 'critical', global: true, involves: [tag, victimTag], focus: { province } },
  );
  return { ok: true };
}

/**
 * Yapay zekâ: ülkesi büyük ölçüde işgal edilmiş nükleer güç, düşman başkentine karşılık verebilir;
 * nükleer saldırıya uğrayan nükleer güç hemen karşılık verir.
 */
export function aiNuclear(ctx: Ctx, tag: Tag, force = false, against?: Tag): void {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c || c.isPlayer || (c.nukes ?? 0) < 1) return;
  const provs = provincesOf(ctx, tag);
  if (!provs.length) return;
  const occ = provs.filter((p) => s.provinces[p].controller !== tag).length / provs.length;
  if (!force && occ < 0.4) return;
  if (!force && ((s.rng >>> 0) % 100) / 100 > 0.12) return;
  // Hedef: düşmanın en değerli bölgesi
  let best = -1;
  let bestV = -1;
  for (let p = 0; p < ctx.w.P; p++) {
    const ps = s.provinces[p];
    if (against ? ps.owner !== against : !atWar(ctx, tag, ps.owner)) continue;
    if (!canNuke(ctx, tag, p).ok) continue;
    const v = provinceValue(ctx, p);
    if (v > bestV) {
      bestV = v;
      best = p;
    }
  }
  if (best >= 0) launchNuke(ctx, tag, best);
}
