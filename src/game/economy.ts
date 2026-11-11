/**
 * Ekonomi ve devlet bütçesi.
 * Bütçe her ay (ve oyuncu politikaları değiştirdiğinde) yeniden hesaplanır; hazine her tur
 * aylık bakiyenin gün oranı kadar değişir. Tek seferlik harcamalar (inşaat, asker toplama,
 * diplomasi) emir verildiği anda hazineden düşülür ve bu ayın bütçe satırlarında gösterilir.
 */
import type { Budget, Country, ResourceId, Tag } from './types';
import { RESOURCE_IDS } from './types';
import { BAL, DAYS_PER_MONTH } from './balance';
import { TAX_RATES, POLICY_DEFS } from './defs/policies';
import { UNIT_DEFS, UNIT_ORDER } from './defs/units';
import { POLICY_IDS } from './types';
import { armiesOf, getMods, provincesOf, type Ctx } from './ctx';
import { atWar, isAtWar, overlordOf, REBEL_TAG, armySoldiers } from './query';
import { notify } from './notify';
import { addRelation } from './query';

export const B_AGRI = 0;
export const B_IND = 1;
export const B_TRADE = 2;
export const B_PORT = 3;
export const B_ROAD = 4;
export const B_UNIV = 5;
export const B_MIL = 6;
export const B_FORT = 7;

export function emptyBudget(): Budget {
  return {
    tax: 0,
    trade: 0,
    production: 0,
    exports: 0,
    tributeIn: 0,
    reparationsIn: 0,
    armyUpkeep: 0,
    navyUpkeep: 0,
    fortUpkeep: 0,
    construction: 0,
    recruitment: 0,
    diplomacy: 0,
    war: 0,
    policies: 0,
    imports: 0,
    interest: 0,
    tributeOut: 0,
    reparationsOut: 0,
    income: 0,
    expenses: 0,
    balance: 0,
  };
}

export function emptyResources(): Country['resources'] {
  const z = (): Record<ResourceId, number> => ({ food: 0, iron: 0, coal: 0, timber: 0 });
  return {
    stock: z(),
    production: z(),
    consumption: z(),
    imported: z(),
    exported: z(),
    shortage: { food: false, iron: false, coal: false, timber: false },
  };
}

// ---------------------------------------------------------------------------
// Fiyatlar
// ---------------------------------------------------------------------------
export function upkeepPer1000(ctx: Ctx): number {
  return (BAL.upkeepK * ctx.s.meta.refGdpPc * 1000) / 12;
}

export function recruitPer1000(ctx: Ctx): number {
  return BAL.recruitK * ctx.s.meta.refGdpPc * 1000;
}

export function resourcePrice(ctx: Ctx, r: ResourceId): number {
  if (r === 'food') return (BAL.foodPriceK * ctx.s.meta.refGdpPc * 1e6) / 12;
  return BAL.resPriceK * ctx.s.meta.refGdpPc * 1000;
}

/** Ücret düzeyi: zengin ülkelerde asker daha pahalı (satın alma gücü etkisi) */
export function costFactor(ctx: Ctx, tag: Tag): number {
  const c = ctx.s.countries[tag];
  const ratio = Math.max(0.01, (c?.wealth ?? ctx.s.meta.refGdpPc) / ctx.s.meta.refGdpPc);
  return Math.max(BAL.costFactorMin, Math.min(BAL.costFactorMax, Math.pow(ratio, BAL.costFactorExp)));
}

/** Birim türü için 1 birim (1 asker / 1 gemi) aylık bakımı */
export function unitUpkeep(ctx: Ctx, tag: Tag, type: (typeof UNIT_ORDER)[number]): number {
  const def = UNIT_DEFS[type];
  const per = type === 'navy' ? upkeepPer1000(ctx) : upkeepPer1000(ctx) / 1000;
  const mods = getMods(ctx, tag);
  return per * def.upkeep * costFactor(ctx, tag) * Math.max(0.2, 1 + mods.upkeep);
}

export function unitRecruitCost(ctx: Ctx, tag: Tag, type: (typeof UNIT_ORDER)[number]): number {
  const def = UNIT_DEFS[type];
  const per = type === 'navy' ? recruitPer1000(ctx) : recruitPer1000(ctx) / 1000;
  const mods = getMods(ctx, tag);
  return per * def.cost * costFactor(ctx, tag) * Math.max(0.3, 1 + mods.recruitCost);
}

// ---------------------------------------------------------------------------
// Bölge üretimi
// ---------------------------------------------------------------------------
const blockadeCache = new WeakMap<object, Set<number>>();

/** Düşman donanmasının abluka altına aldığı kıyı bölgeleri */
export function blockadedProvinces(ctx: Ctx): Set<number> {
  const cached = blockadeCache.get(ctx.cache);
  if (cached) return cached;
  const out = new Set<number>();
  const { w, s } = ctx;
  const fleetsAt = new Map<number, { owner: Tag; power: number }[]>();
  for (const a of Object.values(s.armies)) {
    if (!a.isNavy || a.location < w.P) continue;
    let arr = fleetsAt.get(a.location);
    if (!arr) fleetsAt.set(a.location, (arr = []));
    arr.push({ owner: a.owner, power: a.units.navy });
  }
  for (const [node, fleets] of fleetsAt) {
    for (let e = w.edgeStart[node]; e < w.edgeStart[node + 1]; e++) {
      const p = w.edgeTo[e];
      if (p >= w.P) continue;
      const owner = s.provinces[p].owner;
      let hostile = 0;
      let friendly = 0;
      for (const f of fleets) {
        if (f.owner === owner) friendly += f.power;
        else if (atWar(ctx, f.owner, owner)) hostile += f.power;
      }
      if (hostile > friendly) out.add(p);
    }
  }
  blockadeCache.set(ctx.cache, out);
  return out;
}

export function invalidateBlockades(ctx: Ctx): void {
  blockadeCache.delete(ctx.cache);
}

/** Bölgenin yıllık etkin üretimi (binalar, huzursuzluk, abluka dahil; kontrol hariç) */
export function provinceOutput(ctx: Ctx, p: number): number {
  const ps = ctx.s.provinces[p];
  const b = ps.buildings;
  let o = ps.output * (1 + 0.03 * b[B_AGRI] + 0.06 * b[B_IND] + 0.02 * b[B_ROAD] + 0.01 * b[B_UNIV]);
  o *= 1 - ps.unrest / 200;
  if (blockadedProvinces(ctx).has(p)) o *= 0.8;
  if (ps.siege) o *= 0.7;
  return Math.max(0, o);
}

export function taxEfficiency(ctx: Ctx, tag: Tag): number {
  const c = ctx.s.countries[tag];
  const mods = getMods(ctx, tag);
  let e = 0.55 + mods.taxEfficiency + (c.stability - 50) / 250;
  if (c.bankruptUntil > ctx.s.day) e -= 0.25;
  return Math.max(0.3, Math.min(1.35, e));
}

// ---------------------------------------------------------------------------
// Kaynaklar
// ---------------------------------------------------------------------------
export function provinceResourceOutput(ctx: Ctx, p: number): Record<ResourceId, number> {
  const { w, s } = ctx;
  const ps = s.provinces[p];
  const wp = w.data.provinces[p];
  const mods = getMods(ctx, ps.owner);
  const occupied = ps.controller !== ps.owner ? 0.5 : 1;
  const b = ps.buildings;
  const food =
    wp.res[0] *
    s.meta.foodK *
    Math.sqrt(wp.area) *
    (0.6 + 0.4 * Math.min(1, ps.pop / (500_000 * s.meta.popScale))) *
    (1 + 0.3 * b[B_AGRI]) *
    Math.max(0.2, 1 + mods.foodOutput) *
    occupied;
  const rk = s.meta.resourceK * Math.max(0.2, 1 + mods.resourceOutput) * occupied * (1 + 0.15 * b[B_IND]);
  return {
    food,
    iron: wp.res[1] * rk,
    coal: wp.res[2] * rk,
    timber: wp.res[3] * s.meta.resourceK * Math.max(0.2, 1 + mods.resourceOutput) * occupied,
  };
}

function coalUse(era: string): number {
  return era === 'medieval' ? 0.15 : era === 'napoleonic' ? 0.4 : 0.8;
}

// ---------------------------------------------------------------------------
// Bütçe hesabı (tüm ülkeler)
// ---------------------------------------------------------------------------
export function computeAllBudgets(ctx: Ctx): void {
  const { s, w } = ctx;
  invalidateBlockades(ctx);
  const P = w.P;
  const taxBase = new Map<Tag, number>();
  const occBase = new Map<Tag, number>();
  const tradeBase = new Map<Tag, number>();
  const prodBase = new Map<Tag, number>();
  const res = new Map<Tag, { prod: Record<ResourceId, number>; cons: Record<ResourceId, number> }>();
  const fortLevels = new Map<Tag, number>();
  const outputs = new Map<Tag, number>();
  const getRes = (t: Tag) => {
    let r = res.get(t);
    if (!r) res.set(t, (r = { prod: { food: 0, iron: 0, coal: 0, timber: 0 }, cons: { food: 0, iron: 0, coal: 0, timber: 0 } }));
    return r;
  };
  const add = (m: Map<Tag, number>, t: Tag, v: number) => m.set(t, (m.get(t) ?? 0) + v);
  const cu = coalUse(s.meta.era);

  for (let p = 0; p < P; p++) {
    const ps = s.provinces[p];
    const owner = ps.owner;
    if (owner === REBEL_TAG) continue;
    const out = provinceOutput(ctx, p);
    add(outputs, owner, ps.output);
    const b = ps.buildings;
    if (ps.controller === owner) {
      add(taxBase, owner, out);
      add(tradeBase, owner, out * (0.006 * b[B_TRADE] + 0.004 * b[B_PORT]));
      add(prodBase, owner, out * 0.006 * b[B_IND]);
    } else if (ps.controller !== REBEL_TAG) {
      add(occBase, ps.controller, out * BAL.occupationShare);
    }
    add(fortLevels, owner, b[B_FORT]);
    const r = getRes(owner);
    const ro = provinceResourceOutput(ctx, p);
    for (const k of RESOURCE_IDS) r.prod[k] += ro[k];
    r.cons.food += ps.pop / 1e6;
    r.cons.iron += 0.8 * b[B_IND];
    r.cons.coal += cu * b[B_IND];
    r.cons.timber += 0.04 * (b[B_AGRI] + b[B_TRADE] + b[B_PORT] + b[B_ROAD] + b[B_UNIV] + b[B_MIL] + b[B_FORT]);
  }

  // Ordular
  const armyUp = new Map<Tag, number>();
  const navyUp = new Map<Tag, number>();
  const foreign = new Map<Tag, number>();
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG) continue;
    let land = 0;
    let navy = 0;
    let abroad = 0;
    for (const a of armiesOf(ctx, c.tag)) {
      let cost = 0;
      for (const t of UNIT_ORDER) {
        const n = a.units[t];
        if (n) cost += n * unitUpkeep(ctx, c.tag, t);
      }
      if (a.isNavy) navy += cost;
      else {
        land += cost;
        if (a.location < P) {
          const ctrl = s.provinces[a.location].controller;
          if (ctrl !== c.tag && atWar(ctx, c.tag, s.provinces[a.location].owner)) abroad += cost;
        }
        const r = getRes(c.tag);
        r.cons.food += armySoldiers(a) / 5e5;
        r.cons.iron += (a.units.armor / 1000) * 0.05 + (a.units.artillery / 1000) * 0.02;
      }
      if (a.isNavy) {
        const r = getRes(c.tag);
        r.cons.coal += a.units.navy * (s.meta.era === 'medieval' || s.meta.era === 'napoleonic' ? 0 : 0.05);
        r.cons.timber += a.units.navy * (s.meta.era === 'medieval' || s.meta.era === 'napoleonic' ? 0.08 : 0);
      }
    }
    armyUp.set(c.tag, land);
    navyUp.set(c.tag, navy);
    foreign.set(c.tag, abroad);
  }

  // Ticaret anlaşmaları
  const tradeAg = new Map<Tag, number>();
  const tradeCount = new Map<Tag, number>();
  const tradePartners = new Map<Tag, Tag[]>();
  for (const t of s.treaties) {
    if (t.type !== 'trade') continue;
    const oa = outputs.get(t.a) ?? 0;
    const ob = outputs.get(t.b) ?? 0;
    const v = BAL.tradeAgreementK * Math.sqrt(oa * ob);
    add(tradeAg, t.a, v);
    add(tradeAg, t.b, v);
    add(tradeCount, t.a, 1);
    add(tradeCount, t.b, 1);
    if (!tradePartners.has(t.a)) tradePartners.set(t.a, []);
    if (!tradePartners.has(t.b)) tradePartners.set(t.b, []);
    tradePartners.get(t.a)!.push(t.b);
    tradePartners.get(t.b)!.push(t.a);
  }

  // Kaynak dengeleri (ön hesap: kim fazla veriyor)
  const surplus = new Map<Tag, Record<ResourceId, boolean>>();
  for (const [tag, r] of res) {
    const sp: Record<ResourceId, boolean> = { food: false, iron: false, coal: false, timber: false };
    for (const k of RESOURCE_IDS) sp[k] = r.prod[k] > r.cons[k] * 1.05;
    surplus.set(tag, sp);
  }

  const avgOut = s.meta.avgProvinceOutput;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG) continue;
    const tag = c.tag;
    const mods = getMods(ctx, tag);
    const b = emptyBudget();
    const rate = TAX_RATES[c.policies.tax] ?? TAX_RATES[2];
    const eff = taxEfficiency(ctx, tag);
    const grossTax = ((taxBase.get(tag) ?? 0) * rate * eff) / 12;
    b.tax = grossTax + ((occBase.get(tag) ?? 0) * rate) / 12;
    const nTrade = tradeCount.get(tag) ?? 0;
    const agreementTrade = (tradeAg.get(tag) ?? 0) * Math.sqrt(8 / Math.max(8, nTrade));
    b.trade = (((tradeBase.get(tag) ?? 0) + agreementTrade) * Math.max(0, 1 + mods.tradeIncome)) / 12;

    // Kaynaklar
    const r = res.get(tag) ?? { prod: { food: 0, iron: 0, coal: 0, timber: 0 }, cons: { food: 0, iron: 0, coal: 0, timber: 0 } };
    const led = c.resources;
    let imports = 0;
    let exports = 0;
    const bankrupt = c.bankruptUntil > s.day;
    const partners = tradePartners.get(tag) ?? [];
    for (const k of RESOURCE_IDS) {
      led.production[k] = r.prod[k];
      led.consumption[k] = r.cons[k];
      const net = r.prod[k] - r.cons[k];
      const target = Math.max(k === 'food' ? 5 : 20, r.cons[k] * 6);
      led.imported[k] = 0;
      led.exported[k] = 0;
      const price = resourcePrice(ctx, k);
      if (net < 0 && led.stock[k] + net < target * 0.5) {
        if (!bankrupt) {
          const amount = -net;
          const discount = partners.some((t) => surplus.get(t)?.[k]) ? 0.8 : 1;
          led.imported[k] = amount;
          imports += amount * price * discount;
        }
      } else if (net > 0 && led.stock[k] >= target) {
        led.exported[k] = net;
        exports += net * price * 0.55 * (nTrade > 0 ? 1.15 : 1);
      }
    }
    const shortageFactor = led.shortage.coal || led.shortage.iron ? 0.5 : 1;
    b.production = (((prodBase.get(tag) ?? 0) * Math.max(0, 1 + mods.productionIncome)) / 12) * shortageFactor;
    b.exports = exports;
    b.imports = imports;

    b.armyUpkeep = armyUp.get(tag) ?? 0;
    b.navyUpkeep = navyUp.get(tag) ?? 0;
    b.fortUpkeep = (fortLevels.get(tag) ?? 0) * BAL.fortUpkeep * avgOut;
    if (isAtWar(ctx, tag)) b.war = b.armyUpkeep * BAL.warMobilization + (foreign.get(tag) ?? 0) * BAL.foreignDeployment;
    let policyCost = 0;
    for (const pid of POLICY_IDS) policyCost += POLICY_DEFS[pid].cost[c.policies[pid]] ?? 0;
    b.policies = grossTax * policyCost;
    b.construction = c.monthSpend.construction;
    b.recruitment = c.monthSpend.recruitment;
    b.diplomacy = c.monthSpend.diplomacy;

    // Vasallık ve tazminat
    const overlord = overlordOf(ctx, tag);
    if (overlord) b.tributeOut = grossTax * BAL.tribute;
    for (const t of s.treaties) {
      if (t.type === 'vassal' && t.a === tag) {
        const v = s.countries[t.b];
        if (v?.alive) b.tributeIn += Math.max(0, v.budget.tax - v.budget.tributeIn) * BAL.tribute;
      }
      if (t.type === 'reparations') {
        if (t.a === tag) b.reparationsOut += t.amount ?? 0;
        if (t.b === tag) b.reparationsIn += t.amount ?? 0;
      }
    }

    const recurringIncome = b.tax + b.trade + b.production + b.exports + b.tributeIn + b.reparationsIn;
    if (c.treasury < 0) {
      const annual = Math.max(1, recurringIncome * 12);
      const rate2 = BAL.baseInterest + 0.12 * Math.min(1.5, -c.treasury / annual);
      b.interest = (-c.treasury * rate2) / 12;
    }
    b.income = recurringIncome;
    b.expenses =
      b.armyUpkeep + b.navyUpkeep + b.fortUpkeep + b.war + b.policies + b.imports + b.interest + b.tributeOut + b.reparationsOut;
    b.balance = b.income - b.expenses;
    c.budget = b;
  }
}

/** Tek seferlik harcama: hazineden düş ve bu ayın bütçe satırına ekle */
export function spend(ctx: Ctx, tag: Tag, amount: number, kind: 'construction' | 'recruitment' | 'diplomacy'): void {
  const c = ctx.s.countries[tag];
  c.treasury -= amount;
  c.monthSpend[kind] += amount;
  c.budget[kind] = c.monthSpend[kind];
}

/** Belirtilen miktarı harcayabilir mi (borç limiti dahil) */
export function canAfford(ctx: Ctx, tag: Tag, amount: number): boolean {
  const c = ctx.s.countries[tag];
  if (c.bankruptUntil > ctx.s.day) return c.treasury >= amount;
  // Borçlanma sınırı: yıllık gelirin yarısı
  const limit = Math.max(0, c.budget.income * 6);
  return c.treasury - amount >= -limit;
}

// ---------------------------------------------------------------------------
// Tur işlemleri
// ---------------------------------------------------------------------------
export function economyTick(ctx: Ctx, dt: number, monthChanged: boolean): void {
  const s = ctx.s;
  if (monthChanged) {
    // Ay sonu: kaynak stokları, bütçe yenileme, iflas kontrolü
    for (const c of Object.values(s.countries)) {
      if (!c.alive || c.tag === REBEL_TAG) continue;
      const led = c.resources;
      for (const k of RESOURCE_IDS) {
        led.stock[k] += led.production[k] - led.consumption[k] + led.imported[k] - led.exported[k];
        led.shortage[k] = led.stock[k] < 0;
        if (led.stock[k] < 0) led.stock[k] = 0;
      }
      c.monthSpend = { construction: 0, recruitment: 0, diplomacy: 0 };
    }
    // Vasal vergisi ve tazminat transferleri hazineye bakiye üzerinden yansır
    computeAllBudgets(ctx);
    for (const c of Object.values(s.countries)) {
      if (!c.alive || c.tag === REBEL_TAG) continue;
      checkBankruptcy(ctx, c);
    }
  }
  const frac = dt / DAYS_PER_MONTH;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG) continue;
    c.treasury += c.budget.balance * frac;
  }
}

function checkBankruptcy(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  const annual = Math.max(1, c.budget.income * 12);
  if (c.treasury < -1.5 * annual && c.bankruptUntil <= s.day) {
    c.bankruptUntil = s.day + 365;
    c.treasury *= 0.5;
    c.stability = Math.max(0, c.stability - 25);
    for (const t of s.treaties) {
      if (t.type === 'trade' && (t.a === c.tag || t.b === c.tag)) addRelation(s, t.a, t.b, -10);
    }
    notify(ctx, 'economy', 'notif.bankruptcy', { country: c.name }, { severity: 'critical', involves: [c.tag], global: true, focus: { country: c.tag } });
  }
}

/** Ülkenin yıllık toplam üretimi (GSYH benzeri) */
export function countryOutput(ctx: Ctx, tag: Tag): number {
  let o = 0;
  for (const p of provincesOf(ctx, tag)) o += ctx.s.provinces[p].output;
  return o;
}
