/**
 * İnşaat, asker toplama ve araştırma.
 */
import type { Army, ArmyUnits, BuildingId, ResourceId, Tag, UnitType } from './types';
import { BUILDING_IDS } from './types';
import { BUILDING_DEFS, BUILDING_INDEX } from './defs/buildings';
import { UNIT_DEFS } from './defs/units';
import { TECH_BY_ID, TECH_PREREQ, TECHS } from './defs/techs';
import { armiesAt, getMods, invalidateArmies, provincesOf, type Ctx } from './ctx';
import { canAfford, resourcePrice, spend, unitRecruitCost, B_MIL, B_PORT, B_UNIV } from './economy';
import { notify, newId } from './notify';
import { yearOf } from './calendar';
import { emptyUnits } from './combat';
import { armySize, totalOutput } from './query';

export interface Availability {
  ok: boolean;
  reason?: string;
  reasonParams?: Record<string, string | number>;
  cost: number;
  days: number;
  level: number;
  resources: Partial<Record<ResourceId, number>>;
}

function resourceTopUp(ctx: Ctx, tag: Tag, need: Partial<Record<ResourceId, number>>): number {
  const c = ctx.s.countries[tag];
  let extra = 0;
  for (const [k, v] of Object.entries(need) as [ResourceId, number][]) {
    const short = Math.max(0, v - c.resources.stock[k]);
    extra += short * resourcePrice(ctx, k) * 1.5;
  }
  return extra;
}

function consumeResources(ctx: Ctx, tag: Tag, need: Partial<Record<ResourceId, number>>) {
  const c = ctx.s.countries[tag];
  for (const [k, v] of Object.entries(need) as [ResourceId, number][]) c.resources.stock[k] = Math.max(0, c.resources.stock[k] - v);
}

// ---------------------------------------------------------------------------
// Binalar
// ---------------------------------------------------------------------------
export function buildingAvailability(ctx: Ctx, tag: Tag, p: number, building: BuildingId): Availability {
  const { s, w } = ctx;
  const ps = s.provinces[p];
  const def = BUILDING_DEFS[building];
  const idx = BUILDING_INDEX[building];
  const level = ps.buildings[idx] + 1;
  const res = { timber: def.timber * level, iron: def.iron * level };
  const fail = (reason: string, reasonParams?: Record<string, string | number>): Availability => ({ ok: false, reason, reasonParams, cost: 0, days: 0, level, resources: res });
  if (ps.owner !== tag) return fail('build.notOwned');
  if (ps.controller !== tag) return fail('build.occupied');
  if (ps.construction) return fail('build.busy');
  if (level > def.maxLevel) return fail('build.maxLevel');
  const tech = def.techLevels[level - 1];
  const c = s.countries[tag];
  if (tech && !c.techs.includes(tech)) return fail('build.needsTech', { tech: TECH_BY_ID[tech]?.name.tr ?? tech });
  const terr = w.terrain[p];
  if (def.forbiddenTerrain?.includes(terr)) return fail('build.badTerrain');
  if (def.coastal && !w.coastal[p]) return fail('build.needsCoast');
  const minPop = def.minPop?.[level - 1];
  if (minPop && ps.pop < minPop * s.meta.popScale) return fail('build.needsPop', { pop: Math.round(minPop * s.meta.popScale) });
  const mods = getMods(ctx, tag);
  const levelMult = [1, 1.6, 2.4][level - 1] ?? 3;
  const terrMult = def.terrainCost?.[terr] ?? 1;
  let cost = (def.baseCost * s.meta.avgProvinceOutput + def.ownCost * ps.output) * levelMult * terrMult * Math.max(0.3, 1 + mods.buildCost);
  cost += resourceTopUp(ctx, tag, res);
  const days = Math.round(def.days * Math.max(0.3, 1 + mods.buildTime) * (1 + (level - 1) * 0.25));
  if (!canAfford(ctx, tag, cost)) return { ok: false, reason: 'err.noMoney', cost, days, level, resources: res };
  return { ok: true, cost, days, level, resources: res };
}

export function startConstruction(ctx: Ctx, tag: Tag, p: number, building: BuildingId): Availability {
  const av = buildingAvailability(ctx, tag, p, building);
  if (!av.ok) return av;
  spend(ctx, tag, av.cost, 'construction');
  consumeResources(ctx, tag, av.resources);
  ctx.s.provinces[p].construction = { building, level: av.level, daysLeft: av.days, totalDays: av.days };
  return av;
}

export function cancelConstruction(ctx: Ctx, tag: Tag, p: number): boolean {
  const ps = ctx.s.provinces[p];
  if (!ps.construction || ps.owner !== tag) return false;
  ps.construction = null;
  return true;
}

// ---------------------------------------------------------------------------
// Asker toplama
// ---------------------------------------------------------------------------
export function unitAvailable(ctx: Ctx, tag: Tag, unit: UnitType): boolean {
  const c = ctx.s.countries[tag];
  const def = UNIT_DEFS[unit];
  if (def.requires && !c.techs.includes(def.requires)) return false;
  if (def.obsoleteBy && c.techs.includes(def.obsoleteBy)) return false;
  return true;
}

export function maxRecruitAmount(ctx: Ctx, p: number, unit: UnitType): number {
  const ps = ctx.s.provinces[p];
  if (unit === 'navy') return Math.max(1, ps.buildings[B_PORT] * 5);
  return Math.max(5000, Math.round((ps.pop * 0.05) / 1000) * 1000);
}

export function recruitAvailability(ctx: Ctx, tag: Tag, p: number, unit: UnitType, amount: number): Availability {
  const { s } = ctx;
  const ps = s.provinces[p];
  const def = UNIT_DEFS[unit];
  const per = unit === 'navy' ? amount : amount / 1000;
  const res = { iron: def.iron * per, timber: def.timber * per, coal: def.coal * per };
  const fail = (reason: string, reasonParams?: Record<string, string | number>): Availability => ({ ok: false, reason, reasonParams, cost: 0, days: 0, level: 0, resources: res });
  if (!(amount > 0)) return fail('recruit.invalidAmount');
  if (ps.owner !== tag || ps.controller !== tag) return fail('recruit.notControlled');
  if (ps.siege) return fail('recruit.underSiege');
  if (ps.unrest > 70) return fail('recruit.unrest');
  if (!unitAvailable(ctx, tag, unit)) return fail('recruit.unavailable');
  if (unit === 'navy' && ps.buildings[B_PORT] < 1) return fail('recruit.needsPort');
  const max = maxRecruitAmount(ctx, p, unit);
  const queued = ps.recruits.reduce((n, r) => n + (r.unit === unit ? r.amount : 0), 0);
  if (amount + queued > max) return fail('recruit.tooMany', { max });
  const c = s.countries[tag];
  const manpower = amount * def.manpower;
  if (c.manpower < manpower) return fail('recruit.noManpower');
  if (c.bankruptUntil > s.day) return fail('recruit.bankrupt');
  const mods = getMods(ctx, tag);
  let cost = unitRecruitCost(ctx, tag, unit) * amount;
  cost += resourceTopUp(ctx, tag, res);
  const days = Math.max(5, Math.round(def.days * (1 - 0.2 * ps.buildings[B_MIL]) * Math.max(0.3, 1 + mods.recruitTime)));
  if (!canAfford(ctx, tag, cost)) return { ok: false, reason: 'err.noMoney', cost, days, level: 0, resources: res };
  return { ok: true, cost, days, level: 0, resources: res };
}

export function startRecruit(ctx: Ctx, tag: Tag, p: number, unit: UnitType, amount: number): Availability {
  const av = recruitAvailability(ctx, tag, p, unit, amount);
  if (!av.ok) return av;
  const c = ctx.s.countries[tag];
  spend(ctx, tag, av.cost, 'recruitment');
  consumeResources(ctx, tag, av.resources);
  c.manpower -= amount * UNIT_DEFS[unit].manpower;
  ctx.s.provinces[p].recruits.push({ unit, amount, daysLeft: av.days, totalDays: av.days, owner: tag });
  return av;
}

export function nextArmyName(ctx: Ctx, tag: Tag, navy: boolean): string {
  let n = 1;
  const names = new Set(Object.values(ctx.s.armies).filter((a) => a.owner === tag).map((a) => a.name));
  const fmt = (i: number) => (navy ? `${i}. Filo` : `${i}. Ordu`);
  while (names.has(fmt(n))) n++;
  return fmt(n);
}

export function createArmy(ctx: Ctx, tag: Tag, location: number, units: Partial<ArmyUnits>, opts: { morale?: number; experience?: number; name?: string } = {}): Army {
  const isNavy = (units.navy ?? 0) > 0;
  const a: Army = {
    id: newId(ctx, 'a'),
    owner: tag,
    name: opts.name ?? nextArmyName(ctx, tag, isNavy),
    location,
    units: { ...emptyUnits(), ...units },
    morale: opts.morale ?? 0.8,
    experience: opts.experience ?? 0,
    path: [],
    progress: 0,
    battle: null,
    isNavy,
    rebelAgainst: null,
    aiTarget: null,
    createdDay: ctx.s.day,
    supply: 1,
  };
  ctx.s.armies[a.id] = a;
  invalidateArmies(ctx);
  return a;
}

/** a ordusunu b'ye kat (ağırlıklı moral ve tecrübe) */
export function mergeInto(ctx: Ctx, target: Army, src: Army): void {
  const ts = armySize(target);
  const ss = armySize(src);
  const tot = Math.max(1e-9, ts + ss);
  target.morale = (target.morale * ts + src.morale * ss) / tot;
  target.experience = (target.experience * ts + src.experience * ss) / tot;
  for (const k of Object.keys(target.units) as UnitType[]) target.units[k] += src.units[k];
  delete ctx.s.armies[src.id];
  invalidateArmies(ctx);
}

export function constructionTick(ctx: Ctx, dt: number): void {
  const { s, w } = ctx;
  for (let p = 0; p < w.P; p++) {
    const ps = s.provinces[p];
    if (ps.construction) {
      // İşgal ya da kuşatma inşaatı durdurur
      if (ps.controller === ps.owner && !ps.siege) ps.construction.daysLeft -= dt;
      if (ps.construction.daysLeft <= 0) {
        const job = ps.construction;
        const idx = BUILDING_INDEX[job.building];
        ps.buildings[idx] = Math.max(ps.buildings[idx], job.level);
        ps.construction = null;
        notify(
          ctx,
          'construction',
          'notif.constructionDone',
          { building: job.building, level: job.level, province: w.data.provinces[p].name },
          { severity: 'good', involves: [ps.owner], focus: { province: p } },
        );
      }
    }
    if (ps.recruits.length) {
      const remaining = [];
      for (const r of ps.recruits) {
        if (r.owner !== ps.owner) continue; // sahibi değiştiyse iptal
        if (ps.controller === ps.owner && !ps.siege) r.daysLeft -= dt;
        if (r.daysLeft > 0) {
          remaining.push(r);
          continue;
        }
        const isNavy = r.unit === 'navy';
        const mil = ps.buildings[B_MIL];
        const exp = Math.min(0.3, 0.05 * mil);
        const existing = armiesAt(ctx, p).find((a) => a.owner === r.owner && a.isNavy === isNavy && !a.battle && !a.path.length && a.location === p);
        if (existing) {
          const tmp = createArmy(ctx, r.owner, p, { [r.unit]: r.amount }, { morale: 0.6, experience: exp });
          mergeInto(ctx, existing, tmp);
        } else {
          createArmy(ctx, r.owner, p, { [r.unit]: r.amount }, { morale: 0.6, experience: exp });
        }
        notify(ctx, 'recruit', 'notif.recruitDone', { unit: r.unit, amount: r.amount, province: w.data.provinces[p].name }, { severity: 'good', involves: [r.owner], focus: { province: p } });
      }
      ps.recruits = remaining;
    }
  }
}

// ---------------------------------------------------------------------------
// Araştırma
// ---------------------------------------------------------------------------
export function researchPoints(ctx: Ctx, tag: Tag): number {
  const s = ctx.s;
  const c = s.countries[tag];
  const mods = getMods(ctx, tag);
  let univ = 0;
  for (const p of provincesOf(ctx, tag)) univ += s.provinces[p].buildings[B_UNIV];
  const out = totalOutput(ctx, tag);
  const base = 1.5 + 2.5 * Math.log10(1 + out / Math.max(1, s.meta.avgProvinceOutput)) + 3 * Math.sqrt(univ);
  const wealth = 0.6 + 0.4 * Math.min(2, c.wealth / s.meta.refGdpPc);
  return Math.max(0.2, base * wealth * Math.max(0.2, 1 + mods.researchSpeed));
}

export function techCost(ctx: Ctx, techId: string): number {
  const t = TECH_BY_ID[techId];
  if (!t) return Infinity;
  const year = yearOf(ctx.s.day);
  const ahead = Math.max(0, t.year - year);
  return t.cost * (1 + 0.08 * ahead);
}

export function canResearch(ctx: Ctx, tag: Tag, techId: string): { ok: boolean; reason?: string } {
  const c = ctx.s.countries[tag];
  const t = TECH_BY_ID[techId];
  if (!t) return { ok: false, reason: 'err.notFound' };
  if (c.techs.includes(techId)) return { ok: false, reason: 'research.done' };
  const pre = TECH_PREREQ[techId];
  if (pre && !c.techs.includes(pre)) return { ok: false, reason: 'research.needsPrev' };
  if (t.year - yearOf(ctx.s.day) > 25) return { ok: false, reason: 'research.tooEarly' };
  return { ok: true };
}

export function availableTechs(ctx: Ctx, tag: Tag): string[] {
  return TECHS.filter((t) => canResearch(ctx, tag, t.id).ok).map((t) => t.id);
}

export function researchTick(ctx: Ctx, dt: number): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || !c.research.current) continue;
    const rp = researchPoints(ctx, c.tag) * (dt / 30.44);
    c.research.progress += rp;
    const cost = techCost(ctx, c.research.current);
    if (c.research.progress >= cost) {
      const id = c.research.current;
      c.techs.push(id);
      c.research.progress -= cost;
      c.research.current = null;
      notify(ctx, 'research', 'notif.researchDone', { tech: id }, { severity: 'good', involves: [c.tag] });
    }
  }
}

export { BUILDING_IDS };
