/**
 * Maliye: devlet tahvili ve ülkeler arası kredi, borsa yatırımı, para basma/enflasyon,
 * dünya pazarı (kaynak ve petrol fiyatları), mega projeler, büyük güç sıralaması, ideoloji değişimi.
 */
import type { Ctx } from './ctx';
import { bumpMods, getMods, provincesOf } from './ctx';
import type { Country, Loan, MarketGood, Tag } from './types';
import { addRelation, isAtWar, landPower, REBEL_TAG, relation, totalOutput } from './query';
import { chance, hashString } from './rng';
import { notify, newId } from './notify';
import { MEGA_PROJECTS } from './defs/projects';
import { IDEOLOGY_BY_ID } from './defs/ideologies';
import { addGrievance } from './espionage';

type R = { ok: boolean; error?: string };
const yearly = (c: Country) => Math.max(0.01, c.budget.income * 12);

// ---------------------------------------------------------------------------
// Tahvil ve kredi
// ---------------------------------------------------------------------------
export const MARKET = 'MKT';
export const LOAN_YEARS = 5;

export function debtOf(ctx: Ctx, tag: Tag): number {
  return (ctx.s.loans ?? []).filter((l) => l.to === tag).reduce((a, l) => a + l.amount, 0);
}

/** Tahvil faizi: itibar ve istikrar düşükse, borç yüksekse artar */
export function bondRate(ctx: Ctx, tag: Tag): number {
  const c = ctx.s.countries[tag];
  if (!c) return 0.1;
  const ratio = debtOf(ctx, tag) / yearly(c);
  const r = 0.04 + (50 - c.stability) / 400 - c.reputation / 500 + ratio * 0.04 + (c.inflation ?? 0) * 0.3;
  return Math.max(0.015, Math.min(0.3, r));
}

export function debtLimit(ctx: Ctx, tag: Tag): number {
  return yearly(ctx.s.countries[tag]) * 2;
}

/** Tahvil çıkar: amountK = yıllık gelirin katı */
export function issueBond(ctx: Ctx, tag: Tag, amountK: number): R {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c?.alive || !(amountK > 0) || amountK > 1) return { ok: false, error: 'err.invalidTarget' };
  const amount = yearly(c) * amountK;
  if (debtOf(ctx, tag) + amount > debtLimit(ctx, tag)) return { ok: false, error: 'finance.debtLimit' };
  const rate = bondRate(ctx, tag);
  (s.loans ??= []).push({ id: newId(ctx, 'l'), from: MARKET, to: tag, amount, rate, due: s.day + Math.round(LOAN_YEARS * 365.25) });
  c.treasury += amount;
  return { ok: true };
}

/** Borcu erken kapat */
export function repayLoan(ctx: Ctx, tag: Tag, id: string): R {
  const s = ctx.s;
  const loan = s.loans?.find((l) => l.id === id && l.to === tag);
  if (!loan) return { ok: false, error: 'err.notFound' };
  const c = s.countries[tag];
  if (c.treasury < loan.amount) return { ok: false, error: 'err.noMoney' };
  c.treasury -= loan.amount;
  if (loan.from !== MARKET && s.countries[loan.from]) {
    s.countries[loan.from].treasury += loan.amount;
    addRelation(s, loan.from, tag, 5);
  }
  s.loans = s.loans!.filter((l) => l !== loan);
  return { ok: true };
}

/** Yapay zekâ bu krediyi kabul eder mi */
export function lendAcceptance(ctx: Ctx, from: Tag, to: Tag, amount: number): boolean {
  const tc = ctx.s.countries[to];
  if (!tc?.alive || tc.rebelMovement) return false;
  if (relation(ctx.s, from, to) < -20) return false;
  return debtOf(ctx, to) + amount <= debtLimit(ctx, to);
}

/** Başka ülkeye kredi ver: faiz geliri ve siyasi nüfuz kazandırır */
export function lend(ctx: Ctx, from: Tag, to: Tag, amountK: number): R {
  const s = ctx.s;
  const fc = s.countries[from];
  const tc = s.countries[to];
  if (!fc?.alive || !tc?.alive || from === to || to === REBEL_TAG || !(amountK > 0) || amountK > 2) return { ok: false, error: 'err.invalidTarget' };
  const amount = yearly(fc) * amountK;
  if (fc.treasury < amount) return { ok: false, error: 'err.noMoney' };
  if (!tc.isPlayer && !lendAcceptance(ctx, from, to, amount)) return { ok: false, error: 'finance.lendRefused' };
  fc.treasury -= amount;
  tc.treasury += amount;
  (s.loans ??= []).push({ id: newId(ctx, 'l'), from, to, amount, rate: Math.max(0.03, bondRate(ctx, to) * 0.8), due: s.day + Math.round(LOAN_YEARS * 365.25) });
  addRelation(s, from, to, 10);
  notify(ctx, 'economy', 'notif.loanGiven', { from: fc.name, to: tc.name }, { involves: [from, to], severity: 'info' });
  return { ok: true };
}

/** Borcu geri çağır: ödeyemeyen borçlu itibar ve istikrar kaybeder, alacaklı savaş gerekçesi kazanır */
export function callLoan(ctx: Ctx, from: Tag, id: string): R {
  const s = ctx.s;
  const loan = s.loans?.find((l) => l.id === id && l.from === from);
  if (!loan) return { ok: false, error: 'err.notFound' };
  const tc = s.countries[loan.to];
  const fc = s.countries[from];
  if (tc.treasury >= loan.amount) {
    tc.treasury -= loan.amount;
    fc.treasury += loan.amount;
    s.loans = s.loans!.filter((l) => l !== loan);
    addRelation(s, from, loan.to, -10);
  } else {
    defaulted(ctx, loan);
  }
  return { ok: true };
}

function defaulted(ctx: Ctx, loan: Loan): void {
  const s = ctx.s;
  const tc = s.countries[loan.to];
  tc.reputation = Math.max(-100, tc.reputation - 8);
  tc.stability = Math.max(0, tc.stability - 4);
  loan.due = s.day + 365;
  loan.rate = Math.min(0.4, loan.rate + 0.03);
  if (loan.from !== MARKET && s.countries[loan.from]?.alive) {
    addRelation(s, loan.from, loan.to, -20);
    addGrievance(ctx, loan.from, loan.to, 'treaty', 3);
    notify(ctx, 'economy', 'notif.loanDefault', { from: s.countries[loan.from].name, to: tc.name }, { involves: [loan.from, loan.to], severity: 'bad' });
  } else notify(ctx, 'economy', 'notif.bondRollover', { country: tc.name }, { involves: [loan.to], severity: 'bad' });
}

/** Alacaklının borçlu üzerindeki nüfuzu (diplomatik kabul puanı) */
export function creditorLeverage(ctx: Ctx, creditor: Tag, debtor: Tag): number {
  const dc = ctx.s.countries[debtor];
  if (!dc) return 0;
  const owed = (ctx.s.loans ?? []).filter((l) => l.from === creditor && l.to === debtor).reduce((a, l) => a + l.amount, 0);
  return owed > 0 ? Math.min(25, 8 + (owed / yearly(dc)) * 20) : 0;
}

// ---------------------------------------------------------------------------
// Borsa
// ---------------------------------------------------------------------------
export function invest(ctx: Ctx, tag: Tag, amountK: number): R {
  const c = ctx.s.countries[tag];
  if (!c?.alive || !(amountK > 0) || amountK > 2) return { ok: false, error: 'err.invalidTarget' };
  const amount = yearly(c) * amountK;
  if (c.treasury < amount) return { ok: false, error: 'err.noMoney' };
  c.treasury -= amount;
  c.stocks = (c.stocks ?? 0) + amount;
  return { ok: true };
}

export function divest(ctx: Ctx, tag: Tag): R {
  const c = ctx.s.countries[tag];
  if (!c?.stocks) return { ok: false, error: 'err.notFound' };
  c.treasury += c.stocks;
  c.stocks = 0;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Para basma
// ---------------------------------------------------------------------------
export function printMoney(ctx: Ctx, tag: Tag, amountK: number): R {
  const c = ctx.s.countries[tag];
  if (!c?.alive || !(amountK > 0) || amountK > 1) return { ok: false, error: 'err.invalidTarget' };
  c.treasury += yearly(c) * amountK;
  c.inflation = Math.min(2, (c.inflation ?? 0) + amountK * 0.5);
  bumpMods();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dünya pazarı
// ---------------------------------------------------------------------------
/** Dünya petrol üretimindeki pay (%), 2020 dolayı yaklaşık değerler */
export const OIL_SHARE: Record<string, number> = {
  USA: 18, SAU: 12, RUS: 12, CAN: 6, IRQ: 5, CHN: 5, ARE: 4, BRA: 4, IRN: 3.5, KWT: 3, NOR: 2.2, MEX: 2.1, KAZ: 2, QAT: 2, NGA: 2, DZA: 1.5, AGO: 1.5, LBY: 1.2, OMN: 1.1, GBR: 1.1, VEN: 0.9, AZE: 0.8, IDN: 0.8, COL: 0.9, EGY: 0.7, IND: 0.8,
};
const OIL_K = 0.006;
const FACTOR = { cut: 0.65, normal: 1, boost: 1.2 } as const;
export const MARKET_GOODS: MarketGood[] = ['food', 'iron', 'coal', 'timber', 'oil'];

export function marketPrice(ctx: Ctx, good: MarketGood): number {
  return ctx.s.market?.prices[good] ?? 1;
}

export function setOilPolicy(ctx: Ctx, tag: Tag, policy: 'cut' | 'normal' | 'boost'): R {
  const c = ctx.s.countries[tag];
  if (!c?.alive || !OIL_SHARE[tag]) return { ok: false, error: 'market.noOil' };
  c.oilPolicy = policy;
  return { ok: true };
}

export function marketTick(ctx: Ctx): void {
  const s = ctx.s;
  const m = (s.market ??= { prices: { food: 1, iron: 1, coal: 1, timber: 1, oil: 1 } });
  const alive = Object.values(s.countries).filter((c) => c.alive && c.tag !== REBEL_TAG && !c.rebelMovement);
  const out = new Map<Tag, number>();
  let world = 0;
  let warOut = 0;
  for (const c of alive) {
    const o = totalOutput(ctx, c.tag);
    out.set(c.tag, o);
    world += o;
    if (isAtWar(ctx, c.tag)) warOut += o;
  }
  const war = world > 0 ? warOut / world : 0;
  // Petrol arzı: üretici politikaları, savaş ve ambargo arzı kısar
  let supply = 0;
  let base = 0;
  const embargoed = new Map<Tag, number>();
  for (const t of s.treaties) if (t.type === 'embargo') embargoed.set(t.b, (embargoed.get(t.b) ?? 0) + 1);
  for (const [tag, share] of Object.entries(OIL_SHARE)) {
    base += share;
    const c = s.countries[tag];
    if (!c?.alive) continue;
    let f: number = FACTOR[c.oilPolicy ?? 'normal'];
    if (isAtWar(ctx, tag)) f *= 0.85;
    if ((embargoed.get(tag) ?? 0) >= 3) f *= 0.7;
    supply += share * f;
  }
  const target: Record<MarketGood, number> = {
    food: 1 + war * 0.5,
    iron: 1 + war * 0.9,
    coal: 1 + war * 0.6,
    timber: 1 + war * 0.3,
    oil: Math.pow(base / Math.max(10, supply), 1.6) + war * 0.5,
  };
  for (const g of MARKET_GOODS) {
    const noise = (hashString(`${g}|${s.day}|${s.meta.seed}`) % 1000) / 1000 - 0.5;
    m.prices[g] = Math.max(0.4, Math.min(4, m.prices[g] + (target[g] - m.prices[g]) * 0.2 + noise * 0.06));
  }
  // Petrol ticareti: üreticiler kazanır, ithalatçılar öder (fiyat yükseldikçe transfer büyür)
  const unit = (world * OIL_K) / 12;
  for (const c of alive) {
    const share = ((OIL_SHARE[c.tag] ?? 0) * FACTOR[c.oilPolicy ?? 'normal']) / base;
    const use = (out.get(c.tag) ?? 0) / Math.max(1, world);
    c.oilNet = unit * m.prices.oil * (share - use);
    c.treasury += c.oilNet;
  }
}

// ---------------------------------------------------------------------------
// Mega projeler
// ---------------------------------------------------------------------------
export function projectCost(ctx: Ctx, tag: Tag, id: string): number {
  return yearly(ctx.s.countries[tag]) * (MEGA_PROJECTS[id]?.cost ?? 0);
}

export function startProject(ctx: Ctx, tag: Tag, id: string): R {
  const s = ctx.s;
  const c = s.countries[tag];
  const def = MEGA_PROJECTS[id];
  if (!c?.alive || !def) return { ok: false, error: 'err.invalidTarget' };
  if (c.projects?.[id]) return { ok: false, error: 'err.alreadyHave' };
  if (Object.values(c.projects ?? {}).some((p) => p.end > s.day)) return { ok: false, error: 'project.busy' };
  const cost = projectCost(ctx, tag, id);
  if (c.treasury < cost) return { ok: false, error: 'err.noMoney' };
  c.treasury -= cost;
  (c.projects ??= {})[id] = { start: s.day, end: s.day + Math.round(def.years * 365.25) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Büyük güçler
// ---------------------------------------------------------------------------
export const GREAT_POWER_COUNT = 8;

export function rankPowers(ctx: Ctx): Tag[] {
  const s = ctx.s;
  const list = Object.values(s.countries).filter((c) => c.alive && c.tag !== REBEL_TAG && !c.rebelMovement);
  let maxOut = 1;
  let maxMil = 1;
  const rows = list.map((c) => {
    const o = totalOutput(ctx, c.tag);
    const mil = landPower(ctx, c.tag);
    if (o > maxOut) maxOut = o;
    if (mil > maxMil) maxMil = mil;
    return { tag: c.tag, o, mil };
  });
  return rows
    .map((r) => ({ tag: r.tag, score: (r.o / maxOut) * 0.6 + (r.mil / maxMil) * 0.4 }))
    .sort((a, b) => b.score - a.score || (a.tag < b.tag ? -1 : 1))
    .slice(0, GREAT_POWER_COUNT)
    .map((r) => r.tag);
}

export function powersTick(ctx: Ctx, announce = true): void {
  const s = ctx.s;
  const prev = s.greatPowers ?? [];
  const next = rankPowers(ctx);
  s.greatPowers = next;
  bumpMods();
  if (!announce || !prev.length) return;
  for (const t of prev) {
    if (next.includes(t) || !s.countries[t]?.alive) continue;
    const c = s.countries[t];
    c.stability = Math.max(0, c.stability - 8);
    notify(ctx, 'diplomacy', 'notif.powerLost', { country: c.name }, { involves: [t], global: true, severity: 'bad', focus: { country: t } });
  }
  for (const t of next) if (!prev.includes(t)) notify(ctx, 'diplomacy', 'notif.powerGained', { country: s.countries[t].name }, { involves: [t], global: true, severity: 'good', focus: { country: t } });
}

// ---------------------------------------------------------------------------
// İdeoloji
// ---------------------------------------------------------------------------
export const IDEOLOGY_COOLDOWN_YEARS = 3;

export function setIdeology(ctx: Ctx, tag: Tag, id: string): R {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c?.alive || !IDEOLOGY_BY_ID[id]) return { ok: false, error: 'err.invalidTarget' };
  if (c.ideology === id) return { ok: false, error: 'err.alreadyHave' };
  if (c.ideologyChanged !== undefined && s.day - c.ideologyChanged < IDEOLOGY_COOLDOWN_YEARS * 365) return { ok: false, error: 'err.cooldown' };
  c.ideology = id;
  c.ideologyChanged = s.day;
  bumpMods();
  c.stability = Math.max(0, c.stability - 8);
  c.tempMods = c.tempMods.filter((m) => m.id !== 'ideology_shift');
  c.tempMods.push({ id: 'ideology_shift', label: 'mod.ideologyShift', until: s.day + 365, mods: { unrest: 5 } });
  notify(ctx, 'event', 'notif.ideologyChanged', { country: c.name, ideology: id }, { involves: [tag], global: true, severity: 'info', focus: { country: tag } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Aylık maliye turu
// ---------------------------------------------------------------------------
export function financeTick(ctx: Ctx, yearChanged: boolean): void {
  const s = ctx.s;
  // Faiz ödemeleri ve vadesi gelen borçlar
  if (s.loans?.length) {
    for (const loan of [...s.loans]) {
      const tc = s.countries[loan.to];
      if (!tc?.alive) {
        s.loans = s.loans.filter((l) => l !== loan);
        continue;
      }
      const interest = (loan.amount * loan.rate) / 12;
      tc.treasury -= interest;
      const lender = loan.from !== MARKET ? s.countries[loan.from] : undefined;
      if (lender?.alive) lender.treasury += interest;
      if (s.day >= loan.due) {
        if (tc.treasury >= loan.amount) {
          tc.treasury -= loan.amount;
          if (lender?.alive) lender.treasury += loan.amount;
          s.loans = s.loans.filter((l) => l !== loan);
        } else defaulted(ctx, loan);
      }
    }
  }
  for (const c of Object.values(s.countries)) {
    if (!c.alive) continue;
    if (c.inflation) c.inflation = c.inflation < 0.005 ? 0 : c.inflation * 0.96;
    if (c.stocks) {
      const noise = (hashString(`${c.tag}|stk|${s.day}`) % 1000) / 1000 - 0.5;
      let r = 0.005 + (c.stability - 50) / 5000 + getMods(ctx, c.tag).development - (isAtWar(ctx, c.tag) ? 0.012 : 0) - (c.inflation ?? 0) * 0.05 + noise * 0.1;
      if (chance(s, 0.01)) {
        r = -0.3;
        notify(ctx, 'economy', 'notif.stockCrash', { country: c.name }, { involves: [c.tag], severity: 'bad' });
      }
      c.stocks = Math.max(0, c.stocks * (1 + r));
    }
    // Biten mega proje bildirimi
    if (c.projects) {
      for (const [id, p] of Object.entries(c.projects)) {
        if (p.end <= s.day && p.end > s.day - 32) notify(ctx, 'construction', 'notif.projectDone', { country: c.name, project: id }, { involves: [c.tag], global: true, severity: 'good' });
      }
    }
  }
  bumpMods();
  marketTick(ctx);
  if (yearChanged || !s.greatPowers) powersTick(ctx);
  void provincesOf;
}
