/**
 * Nüfus, insan gücü ve ekonomik gelişme.
 */
import type { Country, Tag } from './types';
import { BAL, DAYS_PER_MONTH } from './balance';
import { getMods, provincesOf, type Ctx } from './ctx';
import { REBEL_TAG } from './query';
import { B_AGRI, B_MIL } from './economy';

export function maxManpower(ctx: Ctx, tag: Tag): number {
  const mods = getMods(ctx, tag);
  const rate = (BAL.mobilization[ctx.s.meta.era] ?? 0.03) * Math.max(0.2, 1 + mods.manpower);
  let pop = 0;
  for (const p of provincesOf(ctx, tag)) {
    const ps = ctx.s.provinces[p];
    if (ps.controller === tag) pop += ps.pop * (ps.cores.includes(tag) ? 1 : 0.35);
  }
  return pop * rate;
}

export function manpowerRegen(ctx: Ctx, tag: Tag): number {
  let mil = 0;
  const provs = provincesOf(ctx, tag);
  for (const p of provs) mil += ctx.s.provinces[p].buildings[B_MIL];
  const bonus = Math.min(1, (mil / Math.max(1, provs.length)) * 0.5 + mil * 0.01);
  return (maxManpower(ctx, tag) / BAL.manpowerRefillMonths) * (1 + bonus);
}

/** Yıllık nüfus artış oranı */
export function popGrowthRate(ctx: Ctx, c: Country): number {
  const s = ctx.s;
  const mods = getMods(ctx, c.tag);
  const base = BAL.popGrowth[s.meta.era] ?? 0.008;
  const wealth = Math.min(3, c.wealth / s.meta.refGdpPc);
  let r = base * (1.5 - 0.35 * wealth) + mods.popGrowth;
  if (c.resources.shortage.food) r -= 0.015;
  r += (c.stability - 50) / 10000;
  return Math.max(-0.03, Math.min(0.04, r));
}

/** Yıllık üretim gelişme oranı (kişi başı) */
export function developmentRate(ctx: Ctx, c: Country): number {
  const s = ctx.s;
  const mods = getMods(ctx, c.tag);
  let r = (BAL.baseDevelopment[s.meta.era] ?? 0.008) + mods.development;
  r += (c.stability - 50) / 3000;
  if (c.bankruptUntil > s.day) r -= 0.02;
  if (c.resources.shortage.coal || c.resources.shortage.iron) r -= 0.005;
  r -= c.warExhaustion / 4000;
  return Math.max(-0.05, Math.min(0.06, r));
}

export function populationTick(ctx: Ctx, dt: number, monthChanged: boolean): void {
  const s = ctx.s;
  const frac = dt / DAYS_PER_MONTH;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG) continue;
    // İnsan gücü yenilenmesi (günlük oranla)
    const max = maxManpower(ctx, c.tag);
    c.manpower = Math.min(max, c.manpower + manpowerRegen(ctx, c.tag) * frac);
  }
  if (!monthChanged) return;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG) continue;
    const g = popGrowthRate(ctx, c) / 12;
    const d = developmentRate(ctx, c) / 12;
    let totalOut = 0;
    let totalPop = 0;
    let coreOut = 0;
    let corePop = 0;
    for (const p of provincesOf(ctx, c.tag)) {
      const ps = s.provinces[p];
      let pg = g + ps.buildings[B_AGRI] * 0.002 / 12;
      if (ps.controller !== ps.owner) pg -= 0.01 / 12;
      if (ps.siege) pg -= 0.005;
      const newPop = Math.max(100, ps.pop * (1 + pg));
      const ratio = newPop / Math.max(1, ps.pop);
      ps.pop = newPop;
      let pd = d;
      if (ps.controller !== ps.owner) pd -= 0.03 / 12;
      ps.output = Math.max(0.0001, ps.output * ratio * (1 + pd));
      totalOut += ps.output;
      totalPop += ps.pop;
      if (ps.cores.includes(c.tag)) {
        coreOut += ps.output;
        corePop += ps.pop;
      }
    }
    // Kişi başı servet: çekirdek bölgeler (yoksa tüm bölgeler)
    if (corePop > 0) c.wealth = coreOut / corePop;
    else if (totalPop > 0) c.wealth = totalOut / totalPop;
  }
}
