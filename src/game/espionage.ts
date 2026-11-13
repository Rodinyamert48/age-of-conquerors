/**
 * Casusluk: hedef ülkede casus ağı kurulur; ağ güçlendikçe istihbarat, sabotaj ve ayaklanma
 * kışkırtma operasyonları açılır. Karşı istihbarat (İstihbarat Başkanı) yakalanma riskini artırır.
 */
import type { Ctx } from './ctx';
import { getMods, provincesOf } from './ctx';
import type { Tag } from './types';
import { addRelation, isFriendly, REBEL_TAG, relation } from './query';
import { chance } from './rng';
import { notify } from './notify';
import { canAfford, spend } from './economy';
import { hasEmbargo, imposeEmbargo } from './diplomacy';

export type SpyOp = 'infiltrate' | 'sabotage' | 'incite' | 'recall';

export const SPY_INTEL_LEVEL = 30;
export const SPY_SABOTAGE_LEVEL = 50;
export const SPY_INCITE_LEVEL = 60;

export function spyNetwork(ctx: Ctx, from: Tag, to: Tag): number {
  return ctx.s.countries[from]?.spies?.[to] ?? 0;
}

/** Oyuncu bu ülkenin gizli bilgilerini (hazine, ordu) görebilir mi */
export function hasIntel(ctx: Ctx, from: Tag, to: Tag): boolean {
  return from === to || spyNetwork(ctx, from, to) >= SPY_INTEL_LEVEL;
}

export function spyCost(ctx: Ctx, from: Tag, op: SpyOp): number {
  const inc = Math.max(0.05, ctx.s.countries[from]?.budget.income ?? 0);
  return op === 'infiltrate' ? inc * 1.5 : op === 'sabotage' ? inc * 2 : op === 'incite' ? inc * 3 : 0;
}

export function spySuccessChance(ctx: Ctx, from: Tag, to: Tag): number {
  const net = spyNetwork(ctx, from, to) / 100;
  const pow = getMods(ctx, from).spyPower;
  const def = getMods(ctx, to).spyDefense;
  return Math.max(0.05, Math.min(0.95, net * 0.9 + pow * 0.5 - def * 0.6));
}

export function addGrievance(ctx: Ctx, victim: Tag, culprit: Tag, kind: 'treaty' | 'spy' | 'embargo', years = 5): void {
  const s = ctx.s;
  (s.grievances ??= {})[`${victim}|${culprit}`] = { until: s.day + Math.round(years * 365.25), kind };
}

export function grievanceOf(ctx: Ctx, victim: Tag, culprit: Tag): 'treaty' | 'spy' | 'embargo' | null {
  const g = ctx.s.grievances?.[`${victim}|${culprit}`];
  return g && g.until > ctx.s.day ? g.kind : null;
}

function caught(ctx: Ctx, from: Tag, to: Tag): void {
  const s = ctx.s;
  const fc = s.countries[from];
  const tc = s.countries[to];
  delete fc.spies![to];
  addRelation(s, from, to, -25);
  fc.reputation = Math.max(-100, fc.reputation - 5);
  addGrievance(ctx, to, from, 'spy');
  notify(ctx, 'diplomacy', 'notif.spyCaught', { from: fc.name, to: tc.name }, { severity: 'bad', involves: [from, to], focus: { country: from === s.player ? to : from } });
}

export function spyOperation(ctx: Ctx, from: Tag, to: Tag, op: SpyOp): { ok: boolean; error?: string; success?: boolean } {
  const s = ctx.s;
  const fc = s.countries[from];
  const tc = s.countries[to];
  if (!fc?.alive || !tc?.alive || from === to || to === REBEL_TAG || tc.rebelMovement) return { ok: false, error: 'err.invalidTarget' };
  fc.spies ??= {};
  const net = fc.spies[to] ?? 0;
  if (op === 'recall') {
    delete fc.spies[to];
    return { ok: true, success: true };
  }
  const cost = spyCost(ctx, from, op);
  if (!canAfford(ctx, from, cost)) return { ok: false, error: 'err.noMoney' };
  if (op === 'infiltrate') {
    if (net > 0) return { ok: false, error: 'spy.alreadyThere' };
    spend(ctx, from, cost, 'diplomacy');
    fc.spies[to] = 20;
    return { ok: true, success: true };
  }
  const need = op === 'sabotage' ? SPY_SABOTAGE_LEVEL : SPY_INCITE_LEVEL;
  if (net < need) return { ok: false, error: 'spy.networkTooWeak' };
  spend(ctx, from, cost, 'diplomacy');
  const success = chance(s, spySuccessChance(ctx, from, to));
  if (!success) {
    fc.spies[to] = Math.max(0, net - 30);
    // Başarısız operasyonda yakalanma olasılığı karşı istihbarata bağlıdır
    if (chance(s, Math.max(0.2, Math.min(0.9, 0.5 + getMods(ctx, to).spyDefense)))) caught(ctx, from, to);
    return { ok: true, success: false };
  }
  const provs = provincesOf(ctx, to).filter((p) => s.provinces[p].controller === to);
  if (op === 'sabotage') {
    // En gelişmiş bölgede bir bina seviyesi yıkılır, hazine zarar görür
    let best = -1;
    let bestLv = 0;
    for (const p of provs) {
      const lv = s.provinces[p].buildings.reduce((a, b) => a + b, 0);
      if (lv > bestLv) {
        bestLv = lv;
        best = p;
      }
    }
    if (best >= 0) {
      const b = s.provinces[best].buildings;
      let bi = 0;
      for (let i = 1; i < b.length; i++) if (b[i] > b[bi]) bi = i;
      if (b[bi] > 0) b[bi] -= 1;
    }
    tc.treasury -= Math.max(0, tc.budget.income) * 2;
    fc.spies[to] = net - 25;
    notify(ctx, 'diplomacy', 'notif.sabotage', { to: tc.name }, { severity: to === s.player ? 'bad' : 'good', involves: [from, to], focus: best >= 0 ? { province: best } : undefined });
  } else {
    // Ayaklanma: en huzursuz bölgelerde huzursuzluk fırlar
    const top = [...provs].sort((a, b) => s.provinces[b].unrest - s.provinces[a].unrest).slice(0, Math.max(2, Math.ceil(provs.length * 0.15)));
    for (const p of top) s.provinces[p].unrest = Math.min(100, s.provinces[p].unrest + 35);
    tc.stability = Math.max(0, tc.stability - 4);
    fc.spies[to] = net - 35;
    notify(ctx, 'rebellion', 'notif.incited', { to: tc.name }, { severity: to === s.player ? 'bad' : 'good', involves: [from, to] });
  }
  return { ok: true, success: true };
}

/** Aylık: ağlar büyür, karşı istihbarat ağları çökertebilir; yapay zekâ rakiplerine casus yollar */
export function espionageTick(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!c.alive) continue;
    if (c.spies) {
      for (const to of Object.keys(c.spies)) {
        const tc = s.countries[to];
        if (!tc?.alive) {
          delete c.spies[to];
          continue;
        }
        const def = getMods(ctx, to).spyDefense;
        if (chance(s, Math.max(0, 0.015 + def * 0.06))) {
          caught(ctx, c.tag, to);
          continue;
        }
        const grow = 5 * Math.max(0.3, 1 + getMods(ctx, c.tag).spyPower - def);
        c.spies[to] = Math.min(100, c.spies[to] + grow);
      }
    }
    // Yapay zekâ: rakibine karşı ağ kurar, fırsat bulursa operasyon yapar
    if (c.isPlayer || c.tag === REBEL_TAG || c.rebelMovement) continue;
    const rival = c.ai.rival;
    if (!rival || !s.countries[rival]?.alive || relation(s, c.tag, rival) > -30) continue;
    // Ekonomik savaş: düşmanca rakibe ambargo
    if (relation(s, c.tag, rival) <= -50 && !hasEmbargo(ctx, c.tag, rival) && !isFriendly(ctx, c.tag, rival) && chance(s, 0.04)) imposeEmbargo(ctx, c.tag, rival);
    const net = c.spies?.[rival] ?? 0;
    if (net === 0) {
      if (c.treasury > spyCost(ctx, c.tag, 'infiltrate') * 6 && chance(s, 0.08)) spyOperation(ctx, c.tag, rival, 'infiltrate');
    } else if (net >= SPY_INCITE_LEVEL && c.treasury > spyCost(ctx, c.tag, 'incite') * 4 && chance(s, 0.05)) {
      spyOperation(ctx, c.tag, rival, chance(s, 0.5) ? 'incite' : 'sabotage');
    }
  }
  if (s.grievances) for (const k of Object.keys(s.grievances)) if (s.grievances[k].until <= s.day) delete s.grievances[k];
}
