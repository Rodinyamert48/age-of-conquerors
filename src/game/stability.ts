/**
 * İstikrar, bölgesel huzursuzluk, isyanlar ve bağımsızlık hareketleri.
 * İstikrar; vergi, savaş yorgunluğu, işgal, gıda kıtlığı, borç ve politikalardan etkilenir.
 * Huzursuzluk yüksek bölgelerde isyan çıkabilir: çekirdeği başka bir ulusa ait bölgelerde
 * bağımsızlık savaşı, diğerlerinde genel isyan.
 */
import type { Country, Tag } from './types';
import { getMods, provincesOf, warsOf, armiesAt, invalidateOwnership, type Ctx } from './ctx';
import { REBEL_TAG, armySoldiers, overlordOf } from './query';
import { chance } from './rng';
import { notify } from './notify';
import { createArmy } from './construction';
import { declareWar, endWar, reviveCountry, provinceValue, releaseNation } from './war';
import { yearsBetween } from './calendar';
import { B_MIL } from './economy';

export interface StabilityBreakdown {
  key: string;
  value: number;
}

export function stabilityTarget(ctx: Ctx, c: Country): { target: number; parts: StabilityBreakdown[] } {
  const s = ctx.s;
  const mods = getMods(ctx, c.tag);
  const parts: StabilityBreakdown[] = [];
  const add = (key: string, value: number) => {
    if (Math.abs(value) >= 0.5) parts.push({ key, value: Math.round(value) });
  };
  add('stab.base', 55);
  add('stab.policies', mods.stability);
  add('stab.warExhaustion', -c.warExhaustion * 0.4);
  const provs = provincesOf(ctx, c.tag);
  if (provs.length) {
    const occ = provs.filter((p) => s.provinces[p].controller !== c.tag).length / provs.length;
    add('stab.occupation', -occ * 30);
    const nonCore = provs.filter((p) => !s.provinces[p].cores.includes(c.tag)).length / provs.length;
    add('stab.nonCore', -nonCore * 15);
  }
  if (c.resources.shortage.food) add('stab.famine', -15);
  if (c.treasury < 0) add('stab.debt', -Math.min(15, (-c.treasury / Math.max(1, c.budget.income * 12)) * 15));
  if (c.bankruptUntil > s.day) add('stab.bankruptcy', -20);
  if (c.budget.balance < 0 && c.treasury < 0) add('stab.deficit', -5);
  if (overlordOf(ctx, c.tag)) add('stab.vassal', -5);
  const target = Math.max(0, Math.min(100, parts.reduce((a, b) => a + b.value, 0)));
  return { target, parts };
}

export function provinceUnrestTarget(ctx: Ctx, p: number): number {
  const s = ctx.s;
  const ps = s.provinces[p];
  const c = s.countries[ps.owner];
  if (!c) return 0;
  const mods = getMods(ctx, ps.owner);
  let u = (60 - c.stability) * 0.5;
  if (!ps.cores.includes(ps.owner)) u += 25;
  if (ps.controller !== ps.owner) u += 15;
  u += c.warExhaustion * 0.2;
  if (c.resources.shortage.food) u += 10;
  if (c.bankruptUntil > s.day) u += 15;
  u += mods.unrest;
  if (armiesAt(ctx, p).some((a) => a.owner === ps.owner && !a.isNavy)) u -= 10;
  u -= ps.buildings[B_MIL] * 2;
  return Math.max(0, Math.min(100, u));
}

export function stabilityTick(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG || c.rebelMovement) continue;
    const { target } = stabilityTarget(ctx, c);
    c.stability = Math.max(0, Math.min(100, c.stability + (target - c.stability) * 0.08));
    // Süresi dolan geçici etkiler
    if (c.tempMods.some((m) => m.until <= s.day)) c.tempMods = c.tempMods.filter((m) => m.until > s.day);
  }
  // Huzursuzluk ve çekirdek entegrasyonu
  for (let p = 0; p < ctx.w.P; p++) {
    const ps = s.provinces[p];
    if (ps.owner === REBEL_TAG) continue;
    const t = provinceUnrestTarget(ctx, p);
    ps.unrest = Math.max(0, Math.min(100, ps.unrest + (t - ps.unrest) * 0.15));
    if (!ps.cores.includes(ps.owner) && ps.controller === ps.owner && yearsBetween(ps.changedDay, s.day) >= 10) {
      ps.cores.push(ps.owner);
      if (ps.owner === s.player) notify(ctx, 'province', 'notif.coreIntegrated', { province: ctx.w.data.provinces[p].name }, { severity: 'good', involves: [ps.owner], focus: { province: p } });
    }
  }
}

/** Aylık isyan kontrolü */
export function rebellionTick(ctx: Ctx): void {
  const { s, w } = ctx;
  if (!s.rules.rebellions) return;
  const rebellingThisMonth = new Set<Tag>();
  for (let p = 0; p < w.P; p++) {
    const ps = s.provinces[p];
    if (ps.unrest < 60 || ps.controller !== ps.owner || ps.owner === REBEL_TAG) continue;
    const owner = s.countries[ps.owner];
    if (!owner?.alive) continue;
    if (!chance(s, (ps.unrest - 55) / 160)) continue;
    // Ayrılıkçı mı?
    const foreign = ps.cores.filter((t) => t !== ps.owner && s.countries[t] && t !== REBEL_TAG);
    const size = Math.round(Math.max(2000, Math.min(120000, ps.pop * 0.004)) / 1000) * 1000;
    if (foreign.length) {
      const nation = foreign[0];
      const nc = s.countries[nation];
      if (nc.alive && !nc.rebelMovement) {
        // Ulus zaten bağımsız: isyan, o ülkeye katılma isteği → huzursuzluk ve istikrar etkisi
        owner.stability = Math.max(0, owner.stability - 1);
        continue;
      }
      let war = warsOf(ctx, nation).find((x) => x.goal.type === 'independence' && x.defenders.includes(ps.owner));
      if (!war) {
        nc.alive = true;
        nc.rebelMovement = true;
        nc.treasury = 0;
        nc.manpower = 0;
        nc.capital = -1;
        const created = declareWar(ctx, nation, ps.owner, { type: 'independence', nation });
        if (!created) continue;
        war = created;
      }
      createArmy(ctx, nation, p, { infantry: size }, { morale: 0.85, name: `${nc.name} Direnişi` });
      ps.unrest = Math.max(0, ps.unrest - 30);
      notify(ctx, 'rebellion', 'notif.separatistRising', { nation: nc.name, province: w.data.provinces[p].name, country: owner.name }, { severity: 'bad', involves: [ps.owner], global: true, focus: { province: p } });
    } else {
      if (rebellingThisMonth.has(ps.owner)) continue;
      rebellingThisMonth.add(ps.owner);
      let war = warsOf(ctx, REBEL_TAG).find((x) => x.goal.type === 'rebellion' && x.defenders.includes(ps.owner));
      if (!war) {
        const created = declareWar(ctx, REBEL_TAG, ps.owner, { type: 'rebellion' });
        if (!created) continue;
        war = created;
      }
      const a = createArmy(ctx, REBEL_TAG, p, { infantry: size }, { morale: 0.75, name: 'İsyancılar' });
      a.rebelAgainst = ps.owner;
      ps.unrest = Math.max(0, ps.unrest - 30);
      notify(ctx, 'rebellion', 'notif.rebellion', { province: w.data.provinces[p].name, country: owner.name }, { severity: 'bad', involves: [ps.owner], focus: { province: p } });
    }
  }
  resolveRebellions(ctx);
}

/** İsyan savaşlarının sonuçlanması */
export function resolveRebellions(ctx: Ctx): void {
  const s = ctx.s;
  for (const war of Object.values(s.wars)) {
    if (war.goal.type === 'rebellion') {
      const target = war.defenderLeader;
      const tc = s.countries[target];
      const rebelArmies = Object.values(s.armies).filter((a) => a.owner === REBEL_TAG && a.rebelAgainst === target);
      const provs = provincesOf(ctx, target);
      const held = provs.filter((p) => s.provinces[p].controller === REBEL_TAG);
      if (!rebelArmies.length && !held.length) {
        endWar(ctx, war);
        if (tc) tc.stability = Math.min(100, tc.stability + 5);
        notify(ctx, 'rebellion', 'notif.rebellionCrushed', { country: tc?.name ?? target }, { severity: 'good', involves: [target] });
        continue;
      }
      const capitalHeld = tc && held.includes(tc.capital);
      if (tc && (held.length >= Math.max(2, provs.length * 0.35) || capitalHeld)) {
        // Hükümet düşer: isyancılar tavizlerle dağılır
        for (const p of held) s.provinces[p].controller = target;
        for (const a of rebelArmies) delete s.armies[a.id];
        invalidateOwnership(ctx);
        endWar(ctx, war);
        tc.stability = 40;
        tc.policies.tax = Math.min(tc.policies.tax, 1);
        tc.warExhaustion = Math.max(0, tc.warExhaustion - 20);
        tc.treasury *= 0.7;
        tc.tempMods.push({ id: 'post_revolution', label: 'mod.postRevolution', until: s.day + 365, mods: { taxEfficiency: -0.15, unrest: -10 } });
        notify(ctx, 'rebellion', 'notif.governmentFell', { country: tc.name }, { severity: 'critical', involves: [target], global: true });
      }
    } else if (war.goal.type === 'independence') {
      const nation = war.goal.nation;
      const nc = s.countries[nation];
      const parent = war.defenderLeader;
      const armies = Object.values(s.armies).filter((a) => a.owner === nation);
      const coreProvs = provincesOf(ctx, parent).filter((p) => s.provinces[p].cores.includes(nation));
      const held = coreProvs.filter((p) => s.provinces[p].controller === nation);
      if (!armies.length && !held.length && !provincesOf(ctx, nation).length) {
        endWar(ctx, war);
        if (nc) {
          nc.alive = false;
          nc.rebelMovement = false;
        }
        notify(ctx, 'rebellion', 'notif.rebellionCrushed', { country: s.countries[parent]?.name ?? parent }, { severity: 'good', involves: [parent] });
        continue;
      }
      // Yapay zekâ ana devlet, isyancılar çekirdek bölgelerin çoğunu tutarsa bağımsızlığı kabul eder
      const pc = s.countries[parent];
      let heldValue = 0;
      let totalValue = 0;
      for (const p of coreProvs) {
        const v = provinceValue(ctx, p);
        totalValue += v;
        if (s.provinces[p].controller === nation) heldValue += v;
      }
      const share = totalValue > 0 ? heldValue / totalValue : 0;
      const recognized = nc?.recognizedBy.length ?? 0;
      if (pc && !pc.isPlayer && share >= 0.6 - Math.min(0.2, recognized * 0.03)) {
        releaseNation(ctx, nation, parent);
        reviveCountry(ctx, nation);
        endWar(ctx, war);
        notify(ctx, 'peace', 'notif.independenceWon', { nation: nc?.name ?? nation, parent: pc.name }, { severity: 'info', involves: [parent, nation], global: true });
      }
      // Bağımsızlık savaşındaki ulus orduları için asker gücü yenilenmez; küçük bir hazine payı
      if (nc) {
        let soldiers = 0;
        for (const a of armies) soldiers += armySoldiers(a);
        nc.manpower = Math.max(0, soldiers * 0.05);
      }
    }
  }
}
