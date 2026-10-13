/**
 * Kuşatma ve işgal. Düşman kontrolündeki bir bölgede, karşısında düşman kara ordusu olmayan
 * birlikler kuşatma ilerlemesi kazanır. Tahkimat süreyi uzatır; kuşatma birlikleri ve topçu kısaltır.
 * Oyuncu yeterli ilerleme olduğunda hücum ederek süreyi kısaltabilir (kayıp karşılığında).
 */
import type { Army, Tag } from './types';
import { UNIT_DEFS, UNIT_ORDER, UNIT_POWER_MOD } from './defs/units';
import { TERRAIN_DEFS } from './defs/terrain';
import { BAL } from './balance';
import { armiesAt, getMods, invalidateArmies, invalidateControl, type Ctx } from './ctx';
import { armySoldiers, atWar, fortLevel, hostileArmies, isFriendly, warBetween, REBEL_TAG } from './query';
import { random } from './rng';
import { notify } from './notify';
import { relocateCapital } from './war';

export interface SiegeInfo {
  besiegers: Army[];
  attacker: Tag;
  fort: number;
  /** toplam gün */
  totalDays: number;
  /** günlük ilerleme */
  rate: number;
  enough: boolean;
  garrison: number;
}

/** Kuşatma için gereken asgari kuvvet */
export function garrisonSize(ctx: Ctx, p: number): number {
  const width = BAL.combatWidth[ctx.s.meta.era] ?? 60000;
  return Math.round(width * 0.01 * (1 + fortLevel(ctx, p) * 2));
}

export function siegeInfo(ctx: Ctx, p: number): SiegeInfo | null {
  const { s, w } = ctx;
  const ps = s.provinces[p];
  const here = armiesAt(ctx, p).filter((a) => !a.isNavy && !a.battle && !a.path.length);
  if (!here.length) return null;
  // Kontrol eden ülkeyle savaşta olan ordular
  const besiegers = here.filter((a) => a.owner !== ps.controller && atWar(ctx, a.owner, ps.controller));
  if (!besiegers.length) return null;
  // Savunan kara ordusu varsa kuşatma yok
  if (here.some((a) => besiegers.some((b) => hostileArmies(ctx, a, b)))) return null;
  // Lider: en büyük ordunun sahibi
  let lead = besiegers[0];
  for (const a of besiegers) if (armySoldiers(a) > armySoldiers(lead)) lead = a;
  const fort = fortLevel(ctx, p);
  const terr = TERRAIN_DEFS[w.terrain[p]];
  let siegePts = 0;
  let soldiers = 0;
  for (const a of besiegers) {
    const mods = getMods(ctx, a.owner);
    for (const t of UNIT_ORDER) {
      if (t === 'navy' || !a.units[t]) continue;
      siegePts += (a.units[t] / 1000) * UNIT_DEFS[t].siege * Math.max(0.2, 1 + mods[UNIT_POWER_MOD[t]]);
      soldiers += a.units[t];
    }
  }
  const mods = getMods(ctx, lead.owner);
  const garrison = garrisonSize(ctx, p);
  const baseDays = (4 + fort * 30) * terr.siege;
  const bonus = Math.min(0.75, siegePts / (siegePts + 4 * (1 + fort)) + mods.siegeSpeed);
  const totalDays = Math.max(2, baseDays * (1 - bonus));
  const enough = soldiers >= garrison;
  return { besiegers, attacker: lead.owner, fort, totalDays, rate: enough ? 1 / totalDays : 0, enough, garrison };
}

export function siegeTick(ctx: Ctx, dt: number): void {
  const { s, w } = ctx;
  // Kuşatma kayıtlarını güncelle
  const active = new Set<number>();
  const nodes = new Set<number>();
  for (const a of Object.values(s.armies)) if (!a.isNavy && a.location < w.P) nodes.add(a.location);
  const sorted = [...nodes].sort((a, b) => a - b);
  for (const p of sorted) {
    const info = siegeInfo(ctx, p);
    if (!info) continue;
    active.add(p);
    const ps = s.provinces[p];
    if (!ps.siege || ps.siege.by !== info.attacker) ps.siege = { by: info.attacker, progress: 0, days: 0 };
    ps.siege.days += dt;
    ps.siege.progress = Math.min(1, ps.siege.progress + info.rate * dt);
    if (ps.siege.progress >= 1) captureProvince(ctx, p, info.attacker);
  }
  // Biten kuşatmaları temizle
  for (let p = 0; p < w.P; p++) {
    const ps = s.provinces[p];
    if (ps.siege && !active.has(p)) ps.siege = null;
  }
}

/** Bölgeyi ele geçir: sahibi kuşatanın tarafındaysa kurtarılır, değilse kuşatanın kontrolüne geçer */
export function captureProvince(ctx: Ctx, p: number, by: Tag): void {
  const { s, w } = ctx;
  const ps = s.provinces[p];
  const prev = ps.controller;
  let newCtrl = by;
  if (ps.owner === by || (isFriendly(ctx, by, ps.owner) && !atWar(ctx, by, ps.owner))) newCtrl = ps.owner;
  ps.controller = newCtrl;
  ps.siege = null;
  ps.changedDay = s.day;
  ps.unrest = Math.min(100, ps.unrest + (newCtrl === ps.owner ? 0 : 15));
  invalidateControl(ctx);
  // Limandaki düşman donanmaları denize çıkar
  for (const a of armiesAt(ctx, p)) {
    if (a.isNavy && a.owner !== newCtrl && atWar(ctx, a.owner, newCtrl)) {
      const sea = w.data.provinces[p].sea[0];
      if (sea !== undefined) {
        a.location = w.P + sea;
        a.path = [];
        invalidateArmies(ctx);
      }
    }
  }
  const owner = s.countries[ps.owner];
  if (newCtrl !== ps.owner && owner && owner.capital === p) {
    owner.stability = Math.max(0, owner.stability - 10);
    if (s.rules.capitalLoss === 'relocate') relocateCapital(ctx, ps.owner);
  }
  const byC = s.countries[by];
  if (byC && newCtrl === by) byC.stats.provincesConquered++;
  const war = warBetween(ctx, by, prev);
  void war;
  const name = w.data.provinces[p].name;
  if (newCtrl === ps.owner) {
    notify(ctx, 'province', 'notif.provinceLiberated', { province: name, country: s.countries[newCtrl]?.name ?? newCtrl }, { severity: 'good', involves: [newCtrl, by, prev], focus: { province: p } });
  } else {
    notify(
      ctx,
      'province',
      'notif.provinceOccupied',
      { province: name, by: newCtrl === REBEL_TAG ? 'İsyancılar' : (s.countries[newCtrl]?.name ?? newCtrl), from: s.countries[prev]?.name ?? prev },
      { severity: prev === s.player || ps.owner === s.player ? 'bad' : 'good', involves: [newCtrl, prev, ps.owner], focus: { province: p } },
    );
  }
}

/** Hücum: başarı şansı ilerlemeye ve kuvvet oranına bağlıdır; kayıp verdirir */
export function assaultChance(ctx: Ctx, p: number): { chance: number; casualties: number } | null {
  const info = siegeInfo(ctx, p);
  if (!info || !info.enough) return null;
  const ps = ctx.s.provinces[p];
  const progress = ps.siege?.progress ?? 0;
  if (info.fort > 0 && progress < 0.25) return null;
  const soldiers = info.besiegers.reduce((n, a) => n + armySoldiers(a), 0);
  const ratio = soldiers / Math.max(1, info.garrison);
  const chance = Math.min(0.95, 0.15 + progress * 0.55 + Math.min(0.3, Math.log10(ratio) * 0.15) - info.fort * 0.05);
  const casualties = Math.round(info.garrison * (1.5 + info.fort * 1.2) * (1 - progress * 0.5));
  return { chance: Math.max(0.05, chance), casualties };
}

export function assault(ctx: Ctx, p: number): { success: boolean; casualties: number } | null {
  const est = assaultChance(ctx, p);
  const info = siegeInfo(ctx, p);
  if (!est || !info) return null;
  const success = random(ctx.s) < est.chance;
  const cas = success ? est.casualties * 0.7 : est.casualties;
  const total = info.besiegers.reduce((n, a) => n + armySoldiers(a), 0);
  for (const a of info.besiegers) {
    const share = armySoldiers(a) / Math.max(1, total);
    const f = Math.max(0, 1 - (cas * share) / Math.max(1, armySoldiers(a)));
    for (const t of UNIT_ORDER) if (t !== 'navy') a.units[t] = Math.floor(a.units[t] * f);
    a.morale = Math.max(0.1, a.morale - (success ? 0.1 : 0.25));
  }
  invalidateArmies(ctx);
  const ps = ctx.s.provinces[p];
  if (success) captureProvince(ctx, p, info.attacker);
  else if (ps.siege) ps.siege.progress = Math.max(0, ps.siege.progress - 0.15);
  return { success, casualties: Math.round(cas) };
}
