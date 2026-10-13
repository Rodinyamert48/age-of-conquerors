/**
 * Veri tabanlı olay sistemi. Olaylar `data/events.ts` ve senaryo dosyalarında tanımlanır;
 * koşullar ve etkiler bu modüldeki yorumlayıcı ile çalıştırılır. Yeni olay eklemek için
 * motor kodunu değiştirmek gerekmez.
 */
import type { Era, GovernmentType, Modifiers, PolicyId, Tag, TreatyType } from './types';
import { POLICY_IDS } from './types';
import { allianceOf, findTreaty, invalidateDiplomacy, neighborCountries, provincesOf, type Ctx } from './ctx';
import { addRelation, atWar, enemiesOf, isAtWar, REBEL_TAG, relation, warSide } from './query';
import { chance, weightedPick, pick } from './rng';
import { notify, newId } from './notify';
import { dateFromDay, parseDate, yearOf } from './calendar';
import { declareWar, joinWar, transferProvince, removeTreaties, applyPeace } from './war';
import { addTreatyIfMissing } from './diplomacy';
import { maxManpower } from './population';
import { techCost } from './construction';
import { getEventDefs } from './data/events';

export type Localized = { tr: string; en: string };

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { stabilityBelow: number }
  | { stabilityAbove: number }
  | { atWar: boolean }
  | { warExhaustionAbove: number }
  | { taxAtLeast: number }
  | { treasuryBelowMonths: number }
  | { treasuryAboveMonths: number }
  | { inDebt: boolean }
  | { foodShortage: boolean }
  | { country: string[] }
  | { yearAtLeast: number }
  | { yearBefore: number }
  | { hasTech: string }
  | { ownsProvince: string }
  | { controlsProvince: string }
  | { countryAlive: string }
  | { atWarWith: string }
  | { hasNeighborAtWar: boolean }
  | { maxUnrestAbove: number }
  | { isPlayer: boolean }
  | { provincesAtLeast: number }
  | { relationWith: { tag: string; below?: number; above?: number } }
  | { era: Era[] }
  | { inAlliance: boolean }
  | { hasForeignCores: boolean };

export type Effect =
  | { treasury: number }
  | { stability: number }
  | { warExhaustion: number }
  | { manpower: number }
  | { reputation: number }
  | { relation: { target: string; value: number } }
  | { unrestAll: number }
  | { unrestNonCore: number }
  | { modifier: { id: string; label: Localized; months: number; mods: Partial<Modifiers> } }
  | { researchProgress: number }
  | { declareWar: { target: string } }
  | { joinWarOf: { tag: string } }
  | { joinAllianceOf: { tag: string } }
  | { whitePeaceAll: true }
  | { addTreaty: { type: TreatyType; with: string; years?: number } }
  | { breakTreaties: { type: TreatyType; with: string[] } }
  | { transferProvinces: { ids: string[]; to: string } }
  | { spawnRebels: number }
  | { government: GovernmentType }
  | { policy: { id: PolicyId; delta: number } }
  | { food: number };

export interface EventOption {
  text: Localized;
  effects: Effect[];
  /** yapay zekâ seçim ağırlığı */
  ai?: number;
}

export interface EventDef {
  id: string;
  title: Localized;
  desc: Localized;
  scenarios?: string[];
  countries?: string[];
  /** sabit tarihli olay (ISO) */
  date?: string;
  /** rastgele olay: ortalama gerçekleşme süresi (ay) */
  meanMonths?: number;
  once?: boolean;
  cooldownYears?: number;
  conditions?: Condition;
  /** olay hedefi */
  target?: 'neighbor' | 'rival' | 'tradePartner' | 'enemy' | 'neighborAtWar' | 'friend';
  options: EventOption[];
  /** tarihî olay (kurallardan kapatılabilir) */
  historical?: boolean;
}

// ---------------------------------------------------------------------------
// Koşullar
// ---------------------------------------------------------------------------
function provIndex(ctx: Ctx, id: string): number {
  return ctx.w.idIndex.get(id) ?? -1;
}

export function checkCondition(ctx: Ctx, tag: Tag, cond: Condition | undefined): boolean {
  if (!cond) return true;
  const s = ctx.s;
  const c = s.countries[tag];
  if ('all' in cond) return cond.all.every((x) => checkCondition(ctx, tag, x));
  if ('any' in cond) return cond.any.some((x) => checkCondition(ctx, tag, x));
  if ('not' in cond) return !checkCondition(ctx, tag, cond.not);
  if ('stabilityBelow' in cond) return c.stability < cond.stabilityBelow;
  if ('stabilityAbove' in cond) return c.stability > cond.stabilityAbove;
  if ('atWar' in cond) return isAtWar(ctx, tag) === cond.atWar;
  if ('warExhaustionAbove' in cond) return c.warExhaustion > cond.warExhaustionAbove;
  if ('taxAtLeast' in cond) return c.policies.tax >= cond.taxAtLeast;
  if ('treasuryBelowMonths' in cond) return c.treasury < c.budget.income * cond.treasuryBelowMonths;
  if ('treasuryAboveMonths' in cond) return c.treasury > c.budget.income * cond.treasuryAboveMonths;
  if ('inDebt' in cond) return c.treasury < 0 === cond.inDebt;
  if ('foodShortage' in cond) return c.resources.shortage.food === cond.foodShortage;
  if ('country' in cond) return cond.country.includes(tag);
  if ('yearAtLeast' in cond) return yearOf(s.day) >= cond.yearAtLeast;
  if ('yearBefore' in cond) return yearOf(s.day) < cond.yearBefore;
  if ('hasTech' in cond) return c.techs.includes(cond.hasTech);
  if ('ownsProvince' in cond) {
    const p = provIndex(ctx, cond.ownsProvince);
    return p >= 0 && s.provinces[p].owner === tag;
  }
  if ('controlsProvince' in cond) {
    const p = provIndex(ctx, cond.controlsProvince);
    return p >= 0 && s.provinces[p].controller === tag;
  }
  if ('countryAlive' in cond) return !!s.countries[cond.countryAlive]?.alive;
  if ('atWarWith' in cond) return atWar(ctx, tag, cond.atWarWith);
  if ('hasNeighborAtWar' in cond) return [...neighborCountries(ctx, tag)].some((n) => isAtWar(ctx, n) && !atWar(ctx, tag, n)) === cond.hasNeighborAtWar;
  if ('maxUnrestAbove' in cond) return provincesOf(ctx, tag).some((p) => s.provinces[p].unrest > cond.maxUnrestAbove);
  if ('isPlayer' in cond) return (tag === s.player) === cond.isPlayer;
  if ('provincesAtLeast' in cond) return provincesOf(ctx, tag).length >= cond.provincesAtLeast;
  if ('relationWith' in cond) {
    const r = relation(s, tag, cond.relationWith.tag);
    if (cond.relationWith.below !== undefined && !(r < cond.relationWith.below)) return false;
    if (cond.relationWith.above !== undefined && !(r > cond.relationWith.above)) return false;
    return true;
  }
  if ('era' in cond) return cond.era.includes(s.meta.era);
  if ('inAlliance' in cond) return !!allianceOf(ctx, tag) === cond.inAlliance;
  if ('hasForeignCores' in cond) return provincesOf(ctx, tag).some((p) => s.provinces[p].cores.some((t) => t !== tag)) === cond.hasForeignCores;
  return false;
}

// ---------------------------------------------------------------------------
// Hedef seçimi
// ---------------------------------------------------------------------------
function pickTarget(ctx: Ctx, tag: Tag, kind: EventDef['target']): Tag | null {
  const s = ctx.s;
  const alive = (t: Tag) => !!s.countries[t]?.alive && t !== REBEL_TAG && !s.countries[t].rebelMovement;
  let cands: Tag[] = [];
  switch (kind) {
    case 'neighbor':
      cands = [...neighborCountries(ctx, tag)].filter(alive);
      break;
    case 'rival':
      cands = [...neighborCountries(ctx, tag)].filter((t) => alive(t) && relation(s, tag, t) < -20);
      break;
    case 'tradePartner':
      cands = Object.values(s.countries)
        .filter((c) => alive(c.tag) && c.tag !== tag && !findTreaty(ctx, 'trade', tag, c.tag) && relation(s, tag, c.tag) > 0 && !atWar(ctx, tag, c.tag))
        .map((c) => c.tag);
      break;
    case 'enemy':
      cands = [...enemiesOf(ctx, tag)].filter(alive);
      break;
    case 'neighborAtWar':
      cands = [...neighborCountries(ctx, tag)].filter((n) => alive(n) && isAtWar(ctx, n) && !atWar(ctx, tag, n));
      break;
    case 'friend':
      cands = Object.values(s.countries)
        .filter((c) => alive(c.tag) && c.tag !== tag && relation(s, tag, c.tag) > 30)
        .map((c) => c.tag);
      break;
    default:
      return null;
  }
  cands.sort();
  return pick(s, cands) ?? null;
}

// ---------------------------------------------------------------------------
// Etkiler
// ---------------------------------------------------------------------------
function resolveTag(target: string, ctxTarget?: Tag): Tag | null {
  if (target === 'TARGET') return ctxTarget ?? null;
  return target;
}

export function applyEffects(ctx: Ctx, tag: Tag, effects: Effect[], target?: Tag): void {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c) return;
  for (const e of effects) {
    if ('treasury' in e) c.treasury += e.treasury * Math.max(0, c.budget.income);
    else if ('stability' in e) c.stability = Math.max(0, Math.min(100, c.stability + e.stability));
    else if ('warExhaustion' in e) c.warExhaustion = Math.max(0, Math.min(100, c.warExhaustion + e.warExhaustion));
    else if ('manpower' in e) c.manpower = Math.max(0, c.manpower + e.manpower * maxManpower(ctx, tag));
    else if ('reputation' in e) c.reputation = Math.max(-100, Math.min(100, c.reputation + e.reputation));
    else if ('relation' in e) {
      const t = resolveTag(e.relation.target, target);
      if (t && s.countries[t]) addRelation(s, tag, t, e.relation.value);
    } else if ('unrestAll' in e) {
      for (const p of provincesOf(ctx, tag)) s.provinces[p].unrest = Math.max(0, Math.min(100, s.provinces[p].unrest + e.unrestAll));
    } else if ('unrestNonCore' in e) {
      for (const p of provincesOf(ctx, tag)) {
        const ps = s.provinces[p];
        if (!ps.cores.includes(tag)) ps.unrest = Math.max(0, Math.min(100, ps.unrest + e.unrestNonCore));
      }
    } else if ('modifier' in e) {
      c.tempMods = c.tempMods.filter((m) => m.id !== e.modifier.id);
      c.tempMods.push({ id: e.modifier.id, label: e.modifier.label.tr, until: s.day + Math.round(e.modifier.months * 30.44), mods: e.modifier.mods });
    } else if ('researchProgress' in e) {
      if (c.research.current) c.research.progress += e.researchProgress * techCost(ctx, c.research.current);
    } else if ('declareWar' in e) {
      const t = resolveTag(e.declareWar.target, target);
      if (t && s.countries[t]?.alive && !atWar(ctx, tag, t)) declareWar(ctx, tag, t, { type: 'scenario', id: 'event' });
    } else if ('joinWarOf' in e) {
      const ally = e.joinWarOf.tag;
      for (const w of Object.values(s.wars)) {
        const side = warSide(w, ally);
        if (!side || warSide(w, tag)) continue;
        const enemies = side === 'attackers' ? w.defenders : w.attackers;
        removeTreaties(ctx, (t) => (t.type === 'nap' || t.type === 'truce') && ((t.a === tag && enemies.includes(t.b)) || (t.b === tag && enemies.includes(t.a))));
        joinWar(ctx, w, tag, side);
      }
    } else if ('joinAllianceOf' in e) {
      const al = allianceOf(ctx, e.joinAllianceOf.tag);
      if (al && !al.members.includes(tag) && !allianceOf(ctx, tag)) {
        al.members.push(tag);
        invalidateDiplomacy(ctx);
      }
    } else if ('whitePeaceAll' in e) {
      for (const w of Object.values(s.wars)) {
        const side = warSide(w, tag);
        if (!side) continue;
        const leader = side === 'attackers' ? w.defenderLeader : w.attackerLeader;
        applyPeace(ctx, w, leader, tag, [], w.attackerLeader !== tag && w.defenderLeader !== tag);
      }
    } else if ('addTreaty' in e) {
      const t = resolveTag(e.addTreaty.with, target);
      if (t && s.countries[t]?.alive && !atWar(ctx, tag, t)) addTreatyIfMissing(ctx, e.addTreaty.type, tag, t, e.addTreaty.years ?? null);
    } else if ('breakTreaties' in e) {
      const set = new Set(e.breakTreaties.with);
      removeTreaties(ctx, (t) => t.type === e.breakTreaties.type && ((t.a === tag && set.has(t.b)) || (t.b === tag && set.has(t.a))));
    } else if ('transferProvinces' in e) {
      const to = resolveTag(e.transferProvinces.to, target);
      if (to && s.countries[to]) {
        for (const id of e.transferProvinces.ids) {
          const p = provIndex(ctx, id);
          if (p >= 0 && s.provinces[p].owner === tag) transferProvince(ctx, p, to);
        }
      }
    } else if ('spawnRebels' in e) {
      const provs = provincesOf(ctx, tag)
        .filter((p) => s.provinces[p].controller === tag)
        .sort((a, b) => s.provinces[b].unrest - s.provinces[a].unrest)
        .slice(0, 2);
      for (const p of provs) s.provinces[p].unrest = Math.min(100, s.provinces[p].unrest + 40 * e.spawnRebels);
    } else if ('government' in e) {
      c.government = e.government;
    } else if ('policy' in e) {
      c.policies[e.policy.id] = Math.max(0, Math.min(4, c.policies[e.policy.id] + e.policy.delta));
    } else if ('food' in e) {
      c.resources.stock.food = Math.max(0, c.resources.stock.food + e.food * c.resources.consumption.food);
    }
  }
}

// ---------------------------------------------------------------------------
// Tetikleme
// ---------------------------------------------------------------------------
function eligible(ctx: Ctx, def: EventDef, tag: Tag): boolean {
  const s = ctx.s;
  if (def.scenarios && !def.scenarios.includes(s.meta.scenarioId)) return false;
  if (def.countries && !def.countries.includes(tag)) return false;
  if (def.historical && !s.rules.historicalEvents) return false;
  const last = s.firedEvents[`${def.id}|${tag}`];
  if (last !== undefined) {
    if (def.once) return false;
    if (def.cooldownYears && s.day - last < def.cooldownYears * 365) return false;
  }
  if (s.pendingEvents.some((p) => p.eventId === def.id && p.country === tag)) return false;
  return checkCondition(ctx, tag, def.conditions);
}

export function fireEvent(ctx: Ctx, def: EventDef, tag: Tag): boolean {
  const s = ctx.s;
  let target: Tag | undefined;
  if (def.target) {
    const t = pickTarget(ctx, tag, def.target);
    if (!t) return false;
    target = t;
  }
  s.firedEvents[`${def.id}|${tag}`] = s.day;
  if (tag === s.player) {
    s.pendingEvents.push({ uid: newId(ctx, 'e'), eventId: def.id, country: tag, day: s.day, expires: s.day + 30, target });
    notify(ctx, 'event', 'notif.eventFired', { event: def.id }, { severity: 'info', involves: [tag] });
    return true;
  }
  const opt = weightedPick(s, def.options, (o) => o.ai ?? 1) ?? def.options[0];
  applyEffects(ctx, tag, opt.effects, target);
  if (def.historical) {
    notify(ctx, 'event', 'notif.worldEvent', { event: def.id, country: s.countries[tag]?.name ?? tag, option: def.options.indexOf(opt) }, { global: true, involves: [tag] });
  }
  return true;
}

export function resolvePendingEvent(ctx: Ctx, uid: string, option: number): boolean {
  const s = ctx.s;
  const pe = s.pendingEvents.find((p) => p.uid === uid);
  if (!pe) return false;
  const def = getEventDefs().find((d) => d.id === pe.eventId);
  s.pendingEvents = s.pendingEvents.filter((p) => p !== pe);
  if (!def) return false;
  const opt = def.options[option] ?? def.options[0];
  applyEffects(ctx, pe.country, opt.effects, pe.target);
  return true;
}

/** Sabit tarihli olaylar her tur; rastgele olaylar ay başında değerlendirilir */
export function eventsTick(ctx: Ctx, newDay: number, monthChanged: boolean): void {
  const s = ctx.s;
  const defs = getEventDefs();
  const tags = Object.values(s.countries)
    .filter((c) => c.alive && c.tag !== REBEL_TAG && !c.rebelMovement)
    .map((c) => c.tag);
  for (const def of defs) {
    if (!def.date) continue;
    if (def.scenarios && !def.scenarios.includes(s.meta.scenarioId)) continue;
    const d = parseDate(def.date);
    if (newDay < d || s.day > d + 400) continue;
    const list = def.countries ?? tags;
    for (const tag of list) {
      if (!s.countries[tag]?.alive) continue;
      if (eligible(ctx, def, tag)) fireEvent(ctx, def, tag);
    }
  }
  // Süresi dolan oyuncu olayları: ilk seçenek uygulanır
  const expired = s.pendingEvents.filter((p) => p.expires <= newDay);
  for (const pe of expired) resolvePendingEvent(ctx, pe.uid, 0);
  if (!monthChanged) return;
  for (const tag of tags) {
    let firedOne = false;
    for (const def of defs) {
      if (def.date || !def.meanMonths || firedOne) continue;
      if (!chance(s, 1 - Math.exp(-1 / def.meanMonths))) continue;
      if (!eligible(ctx, def, tag)) continue;
      firedOne = fireEvent(ctx, def, tag);
    }
  }
  void dateFromDay;
}

export const POLICY_KEYS = POLICY_IDS;
