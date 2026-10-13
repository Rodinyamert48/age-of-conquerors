/**
 * Muharebe çözümü. Her gün bir tur: taraflar birlik türleri, arazi, moral, tecrübe, ikmal,
 * tahkimat ve teknoloji çarpanlarıyla hasar verir. Moral çöken ya da ağır kayıp veren taraf çekilir.
 */
import type { Army, ArmyUnits, Battle, BattleReport, BattleSideSnapshot, Modifiers, Tag, Terrain, UnitType } from './types';
import { UNIT_DEFS, UNIT_ORDER, UNIT_POWER_MOD } from './defs/units';
import { TERRAIN_DEFS } from './defs/terrain';
import { BAL } from './balance';
import { armiesAt, getMods, invalidateArmies, type Ctx } from './ctx';
import { armySize, armySoldiers, fortLevel, hostileArmies, isFriendly, warBetween, warSide } from './query';
import { random, nextRandom } from './rng';
import { notify, newId } from './notify';
import { nearestFriendlyProvince } from './movement';
import { maxManpower } from './population';

const CASUALTY_WEIGHT: Record<UnitType, number> = {
  infantry: 1,
  light: 1,
  cavalry: 1.1,
  artillery: 0.6,
  siege: 0.5,
  armor: 0.8,
  air: 0.4,
  navy: 1,
};

export function emptyUnits(): ArmyUnits {
  return { infantry: 0, light: 0, cavalry: 0, artillery: 0, siege: 0, armor: 0, air: 0, navy: 0 };
}

export function sumUnits(armies: { units: ArmyUnits }[]): ArmyUnits {
  const u = emptyUnits();
  for (const a of armies) for (const t of UNIT_ORDER) u[t] += a.units[t];
  return u;
}

function unitsTotal(u: ArmyUnits, naval: boolean): number {
  if (naval) return u.navy;
  let n = 0;
  for (const t of UNIT_ORDER) if (t !== 'navy') n += u[t];
  return n;
}

// ---------------------------------------------------------------------------
// Saf muharebe çekirdeği (tahmin ve gerçek muharebe aynı kodu kullanır)
// ---------------------------------------------------------------------------
export interface SimArmy {
  units: ArmyUnits;
  morale: number;
  experience: number;
  supply: number;
  mods: Modifiers;
}

export interface SimContext {
  terrain: Terrain | 'sea';
  naval: boolean;
  /** savunan için tahkimat seviyesi */
  fort: number;
  width: number;
}

function composition(side: SimArmy[], naval: boolean): Record<UnitType, number> {
  const out = emptyUnits() as unknown as Record<UnitType, number>;
  let total = 0;
  for (const a of side)
    for (const t of UNIT_ORDER) {
      if (naval !== (t === 'navy')) continue;
      out[t] += a.units[t];
      total += a.units[t];
    }
  if (total > 0) for (const t of UNIT_ORDER) out[t] /= total;
  return out;
}

function sideDamage(side: SimArmy[], enemyComp: Record<UnitType, number>, sc: SimContext): number {
  let dmg = 0;
  for (const a of side) {
    let armyDmg = 0;
    for (const t of UNIT_ORDER) {
      const n = a.units[t];
      if (!n || sc.naval !== (t === 'navy')) continue;
      const def = UNIT_DEFS[t];
      const per = t === 'navy' ? n : n / 1000;
      const terr = sc.terrain === 'sea' ? 1 : (def.terrain[sc.terrain] ?? 1);
      let vs = 0;
      for (const et of UNIT_ORDER) if (enemyComp[et]) vs += enemyComp[et] * (def.vs[et] ?? 1);
      armyDmg += per * def.attack * Math.max(0.2, 1 + a.mods[UNIT_POWER_MOD[t]]) * terr * (vs || 1);
    }
    const morale = 0.4 + 0.6 * Math.max(0, a.morale);
    armyDmg *= morale * (1 + 0.5 * a.experience) * (0.7 + 0.3 * a.supply);
    dmg += armyDmg;
  }
  return dmg;
}

function sideDefense(side: SimArmy[], naval: boolean): number {
  let w = 0;
  let n = 0;
  for (const a of side)
    for (const t of UNIT_ORDER) {
      const c = a.units[t];
      if (!c || naval !== (t === 'navy')) continue;
      w += c * UNIT_DEFS[t].defense;
      n += c;
    }
  return n > 0 ? w / n : 1;
}

function breakthroughShare(side: SimArmy[]): number {
  let b = 0;
  let n = 0;
  for (const a of side)
    for (const t of UNIT_ORDER) {
      if (t === 'navy') continue;
      b += a.units[t] * UNIT_DEFS[t].breakthrough;
      n += a.units[t];
    }
  return n > 0 ? b / n : 0;
}

function applyCasualties(side: SimArmy[], casualties: number, naval: boolean): number {
  const total = side.reduce((s, a) => s + unitsTotal(a.units, naval), 0);
  if (total <= 0) return 0;
  let applied = 0;
  for (const a of side) {
    const size = unitsTotal(a.units, naval);
    if (!size) continue;
    const share = (casualties * size) / total;
    let wsum = 0;
    for (const t of UNIT_ORDER) if (naval === (t === 'navy')) wsum += a.units[t] * CASUALTY_WEIGHT[t];
    if (wsum <= 0) continue;
    for (const t of UNIT_ORDER) {
      if (naval !== (t === 'navy') || !a.units[t]) continue;
      const loss = Math.min(a.units[t], (share * a.units[t] * CASUALTY_WEIGHT[t]) / wsum);
      const l = naval ? loss : Math.round(loss);
      a.units[t] -= l;
      if (a.units[t] < (naval ? 0.05 : 1)) a.units[t] = 0;
      applied += l;
    }
  }
  return applied;
}

export interface RoundResult {
  attLoss: number;
  defLoss: number;
}

/** Bir günlük muharebe turu (yerinde değişiklik yapar) */
export function combatRound(att: SimArmy[], def: SimArmy[], sc: SimContext, rand: () => number): RoundResult {
  const naval = sc.naval;
  const attSize = att.reduce((s, a) => s + unitsTotal(a.units, naval), 0);
  const defSize = def.reduce((s, a) => s + unitsTotal(a.units, naval), 0);
  if (attSize <= 0 || defSize <= 0) return { attLoss: 0, defLoss: 0 };
  const attComp = composition(att, naval);
  const defComp = composition(def, naval);
  let attDmg = sideDamage(att, defComp, sc);
  let defDmg = sideDamage(def, attComp, sc);
  if (!naval) {
    attDmg *= Math.min(1, sc.width / attSize);
    defDmg *= Math.min(1, sc.width / defSize);
  }
  attDmg *= 0.85 + rand() * 0.3;
  defDmg *= 0.85 + rand() * 0.3;
  const terrDef = sc.terrain === 'sea' ? 0 : TERRAIN_DEFS[sc.terrain].defense;
  const fortMods = def[0]?.mods.fortDefense ?? 0;
  const fortBonus = sc.fort * 0.15 * (1 + fortMods) * (1 - breakthroughShare(att));
  const defFactor = sideDefense(def, naval) * (1 + terrDef + fortBonus);
  const attFactor = sideDefense(att, naval);
  let defCas: number;
  let attCas: number;
  if (naval) {
    defCas = (attDmg * 0.012) / defFactor;
    attCas = (defDmg * 0.012) / attFactor;
  } else {
    defCas = (attDmg * BAL.casualtyK) / defFactor;
    attCas = (defDmg * BAL.casualtyK) / attFactor;
  }
  const defLoss = applyCasualties(def, defCas, naval);
  const attLoss = applyCasualties(att, attCas, naval);
  const ratioA = attDmg / Math.max(1e-6, defDmg);
  const ratioD = defDmg / Math.max(1e-6, attDmg);
  const defMoraleLoss = 0.03 + (defLoss / defSize) * 3.5 + Math.max(0, ratioA - 1) * 0.02;
  const attMoraleLoss = 0.03 + (attLoss / attSize) * 3.5 + Math.max(0, ratioD - 1) * 0.02;
  for (const a of def) a.morale = Math.max(0, a.morale - defMoraleLoss / Math.max(0.6, 1 + a.mods.morale));
  for (const a of att) a.morale = Math.max(0, a.morale - attMoraleLoss / Math.max(0.6, 1 + a.mods.morale));
  return { attLoss, defLoss };
}

function sideMorale(side: SimArmy[], naval: boolean): number {
  let m = 0;
  let n = 0;
  for (const a of side) {
    const s = unitsTotal(a.units, naval);
    m += a.morale * s;
    n += s;
  }
  return n > 0 ? m / n : 0;
}

/** Muharebe bitti mi: 'attacker' | 'defender' kazanan, null devam */
export function battleOutcome(att: SimArmy[], def: SimArmy[], attStart: number, defStart: number, naval: boolean): 'attacker' | 'defender' | null {
  const as = att.reduce((s, a) => s + unitsTotal(a.units, naval), 0);
  const ds = def.reduce((s, a) => s + unitsTotal(a.units, naval), 0);
  const am = sideMorale(att, naval);
  const dm = sideMorale(def, naval);
  const minSize = naval ? 0.3 : 100;
  const attBroken = as < minSize || as < attStart * 0.1 || am <= 0.12;
  const defBroken = ds < minSize || ds < defStart * 0.1 || dm <= 0.12;
  if (attBroken && defBroken) return am / Math.max(0.01, attStart > 0 ? 1 : 1) >= dm ? 'attacker' : 'defender';
  if (attBroken) return 'defender';
  if (defBroken) return 'attacker';
  return null;
}

export interface Prediction {
  winner: 'attacker' | 'defender';
  attackerWinChance: number;
  attLoss: number;
  defLoss: number;
  days: number;
}

function cloneSim(a: SimArmy): SimArmy {
  return { ...a, units: { ...a.units } };
}

export function simulateBattle(att: SimArmy[], def: SimArmy[], sc: SimContext, rand: () => number, maxDays = 90) {
  const A = att.map(cloneSim);
  const D = def.map(cloneSim);
  const attStart = A.reduce((s, a) => s + unitsTotal(a.units, sc.naval), 0);
  const defStart = D.reduce((s, a) => s + unitsTotal(a.units, sc.naval), 0);
  let attLoss = 0;
  let defLoss = 0;
  for (let day = 1; day <= maxDays; day++) {
    const r = combatRound(A, D, sc, rand);
    attLoss += r.attLoss;
    defLoss += r.defLoss;
    const out = battleOutcome(A, D, attStart, defStart, sc.naval);
    if (out) return { winner: out, attLoss, defLoss, days: day };
  }
  return { winner: 'defender' as const, attLoss, defLoss, days: maxDays };
}

/** Tahmini sonuç: 24 farklı tohumla benzetim (oyun RNG'sini tüketmez) */
export function predictBattle(att: SimArmy[], def: SimArmy[], sc: SimContext, seed = 12345): Prediction {
  let wins = 0;
  let aL = 0;
  let dL = 0;
  let days = 0;
  const N = 24;
  let st = seed >>> 0;
  const rand = () => {
    const [n, v] = nextRandom(st);
    st = n;
    return v;
  };
  for (let i = 0; i < N; i++) {
    const r = simulateBattle(att, def, sc, rand);
    if (r.winner === 'attacker') wins++;
    aL += r.attLoss;
    dL += r.defLoss;
    days += r.days;
  }
  return {
    winner: wins >= N / 2 ? 'attacker' : 'defender',
    attackerWinChance: wins / N,
    attLoss: aL / N,
    defLoss: dL / N,
    days: days / N,
  };
}

export function toSim(ctx: Ctx, a: Army): SimArmy {
  return { units: { ...a.units }, morale: a.morale, experience: a.experience, supply: a.supply, mods: getMods(ctx, a.owner) };
}

export function simContextAt(ctx: Ctx, node: number, defenderTag: Tag | null): SimContext {
  const { w, s } = ctx;
  const naval = node >= w.P;
  const terrain: Terrain | 'sea' = naval ? 'sea' : w.terrain[node];
  let fort = 0;
  if (!naval && defenderTag) {
    const ps = s.provinces[node];
    if (ps.controller === defenderTag || isFriendly(ctx, defenderTag, ps.controller)) fort = fortLevel(ctx, node);
  }
  const width = naval ? Infinity : (BAL.combatWidth[s.meta.era] ?? 60000) * TERRAIN_DEFS[terrain as Terrain].width;
  return { terrain, naval, fort, width };
}

// ---------------------------------------------------------------------------
// Oyundaki muharebeler
// ---------------------------------------------------------------------------
function snapshot(ctx: Ctx, tag: Tag, armies: Army[], naval: boolean): BattleSideSnapshot {
  const units = sumUnits(armies);
  const total = unitsTotal(units, naval);
  let morale = 0;
  for (const a of armies) morale += a.morale * armySize(a);
  return {
    tag,
    armies: armies.map((a) => a.id),
    start: total,
    strength: total,
    morale: total > 0 ? morale / total : 0,
    units,
    losses: 0,
  };
}

/** Bir düğümde düşman ordular varsa muharebe başlatır ya da gelen orduyu mevcut muharebeye katar */
export function engageAt(ctx: Ctx, node: number, arriving: Army | null): Battle | null {
  const { s, w } = ctx;
  const here = armiesAt(ctx, node).filter((a) => (node >= w.P ? a.isNavy : !a.isNavy));
  if (here.length < 2) return null;
  // Mevcut muharebe
  const existing = Object.values(s.battles).find((b) => b.location === node);
  if (existing) {
    if (arriving && !arriving.battle && (node >= w.P) === arriving.isNavy) {
      const attArmies = existing.attacker.armies.map((id) => s.armies[id]).filter(Boolean);
      const defArmies = existing.defender.armies.map((id) => s.armies[id]).filter(Boolean);
      const vsDef = defArmies.some((d) => hostileArmies(ctx, arriving, d));
      const vsAtt = attArmies.some((d) => hostileArmies(ctx, arriving, d));
      if (vsDef && !vsAtt) {
        existing.attacker.armies.push(arriving.id);
        existing.attacker.start += armySize(arriving);
        arriving.battle = existing.id;
        arriving.path = [];
        notifyReinforce(ctx, existing, arriving);
      } else if (vsAtt && !vsDef) {
        existing.defender.armies.push(arriving.id);
        existing.defender.start += armySize(arriving);
        arriving.battle = existing.id;
        arriving.path = [];
        notifyReinforce(ctx, existing, arriving);
      }
    }
    return existing;
  }
  // Yeni muharebe: ilk düşman çifti
  let a0: Army | null = null;
  let b0: Army | null = null;
  const order = arriving ? [arriving, ...here.filter((x) => x !== arriving)] : here;
  outer: for (const x of order) {
    if (x.battle) continue;
    for (const y of here) {
      if (y === x || y.battle) continue;
      if (hostileArmies(ctx, x, y)) {
        a0 = x;
        b0 = y;
        break outer;
      }
    }
  }
  if (!a0 || !b0) return null;
  const sideA = here.filter((x) => !x.battle && (x.owner === a0!.owner || (!hostileArmies(ctx, x, a0!) && hostileArmies(ctx, x, b0!))));
  const sideB = here.filter((x) => !x.battle && !sideA.includes(x) && (x.owner === b0!.owner || (!hostileArmies(ctx, x, b0!) && hostileArmies(ctx, x, a0!))));
  // Savunan: bölgeyi kontrol eden taraf; yoksa yerinde duran taraf
  let attackers = sideA;
  let defenders = sideB;
  if (node < w.P) {
    const ctrl = s.provinces[node].controller;
    const aCtrl = sideA.some((x) => x.owner === ctrl || isFriendly(ctx, x.owner, ctrl));
    if (aCtrl) {
      attackers = sideB;
      defenders = sideA;
    }
  } else if (arriving && sideB.includes(arriving)) {
    attackers = sideB;
    defenders = sideA;
  }
  const naval = node >= w.P;
  const attTag = attackers[0].owner;
  const defTag = defenders[0].owner;
  const sc = simContextAt(ctx, node, defTag);
  const b: Battle = {
    id: newId(ctx, 'b'),
    location: node,
    naval,
    startDay: s.day,
    days: 0,
    attacker: snapshot(ctx, attTag, attackers, naval),
    defender: snapshot(ctx, defTag, defenders, naval),
    terrain: sc.terrain,
    fort: sc.fort,
    log: [],
  };
  for (const a of [...attackers, ...defenders]) {
    a.battle = b.id;
    a.path = [];
    a.progress = 0;
  }
  s.battles[b.id] = b;
  const ps = node < w.P ? w.data.provinces[node].name : '';
  notify(
    ctx,
    'battle',
    naval ? 'notif.navalBattleStarted' : 'notif.battleStarted',
    { place: ps, attacker: s.countries[attTag]?.name ?? attTag, defender: s.countries[defTag]?.name ?? defTag },
    { severity: 'info', involves: [attTag, defTag, ...attackers.map((x) => x.owner), ...defenders.map((x) => x.owner)], focus: { battle: b.id, province: node < w.P ? node : undefined } },
  );
  return b;
}

function notifyReinforce(ctx: Ctx, b: Battle, a: Army) {
  notify(ctx, 'battle', 'notif.reinforcements', { army: a.name }, { involves: [a.owner, b.attacker.tag, b.defender.tag], focus: { battle: b.id } });
}

export function battleTick(ctx: Ctx, dt: number): void {
  const { s } = ctx;
  const ids = Object.keys(s.battles).sort();
  for (const id of ids) {
    const b = s.battles[id];
    if (!b) continue;
    for (let d = 0; d < dt; d++) {
      const done = battleDay(ctx, b);
      if (done) break;
    }
  }
}

/** Bir muharebe günü; muharebe bittiyse true */
function battleDay(ctx: Ctx, b: Battle): boolean {
  const { s } = ctx;
  const att = b.attacker.armies.map((id) => s.armies[id]).filter((a): a is Army => !!a);
  const def = b.defender.armies.map((id) => s.armies[id]).filter((a): a is Army => !!a);
  if (!att.length || !def.length) {
    endBattle(ctx, b, att.length ? 'attacker' : 'defender', att, def);
    return true;
  }
  const sc = simContextAt(ctx, b.location, b.defender.tag);
  sc.fort = b.fort;
  const A = att.map((a) => toSim(ctx, a));
  const D = def.map((a) => toSim(ctx, a));
  const r = combatRound(A, D, sc, () => random(s));
  // Simülasyon sonucunu ordulara yaz
  att.forEach((a, i) => {
    a.units = A[i].units;
    a.morale = A[i].morale;
  });
  def.forEach((a, i) => {
    a.units = D[i].units;
    a.morale = D[i].morale;
  });
  b.days++;
  b.attacker.losses += r.attLoss;
  b.defender.losses += r.defLoss;
  b.attacker.units = sumUnits(att);
  b.defender.units = sumUnits(def);
  b.attacker.strength = unitsTotal(b.attacker.units, b.naval);
  b.defender.strength = unitsTotal(b.defender.units, b.naval);
  b.attacker.morale = avgMorale(att, b.naval);
  b.defender.morale = avgMorale(def, b.naval);
  b.log.push({ day: s.day, attLoss: Math.round(r.attLoss * 100) / 100, defLoss: Math.round(r.defLoss * 100) / 100, attMorale: b.attacker.morale, defMorale: b.defender.morale });
  if (b.log.length > 60) b.log.shift();
  const out = battleOutcome(A, D, b.attacker.start, b.defender.start, b.naval);
  if (out) {
    endBattle(ctx, b, out, att, def);
    return true;
  }
  return false;
}

function avgMorale(armies: Army[], naval: boolean): number {
  let m = 0;
  let n = 0;
  for (const a of armies) {
    const s = naval ? a.units.navy : armySoldiers(a);
    m += a.morale * s;
    n += s;
  }
  return n > 0 ? m / n : 0;
}

function endBattle(ctx: Ctx, b: Battle, winner: 'attacker' | 'defender', att: Army[], def: Army[]): void {
  const { s, w } = ctx;
  const winners = winner === 'attacker' ? att : def;
  const losers = winner === 'attacker' ? def : att;
  const winSide = winner === 'attacker' ? b.attacker : b.defender;
  const loseSide = winner === 'attacker' ? b.defender : b.attacker;
  for (const a of [...att, ...def]) a.battle = null;
  for (const a of winners) a.experience = Math.min(1, a.experience + 0.05 + Math.min(0.1, loseSide.losses / Math.max(1, winSide.start) * 0.2));
  for (const a of losers) a.experience = Math.min(1, a.experience + 0.02);

  // Kaybedenler geri çekilir; çekilecek yer yoksa dağılır
  for (const a of losers) {
    const size = armySize(a);
    if (size <= (a.isNavy ? 0.3 : 200)) {
      delete s.armies[a.id];
      continue;
    }
    let dest = -1;
    if (a.isNavy) {
      dest = retreatNaval(ctx, a);
    } else {
      dest = nearestFriendlyProvince(ctx, a.owner, b.location, true);
    }
    if (dest < 0) {
      delete s.armies[a.id];
      continue;
    }
    a.location = dest;
    a.path = [];
    a.progress = 0;
    a.morale = Math.min(a.morale, 0.15);
  }
  // Boşalmış orduları temizle
  for (const a of winners) if (armySize(a) <= (a.isNavy ? 0.05 : 0)) delete s.armies[a.id];
  invalidateArmies(ctx);

  // İstatistikler ve savaş skoru
  const wTag = winSide.tag;
  const lTag = loseSide.tag;
  const wc = s.countries[wTag];
  const lc = s.countries[lTag];
  const scale = b.naval ? 300 : 1; // gemi → yaklaşık asker
  if (wc) {
    wc.stats.battlesWon++;
    wc.stats.casualties += winSide.losses * scale;
    wc.stats.kills += loseSide.losses * scale;
  }
  if (lc) {
    lc.stats.battlesLost++;
    lc.stats.casualties += loseSide.losses * scale;
    lc.stats.kills += winSide.losses * scale;
  }
  const war = warBetween(ctx, wTag, lTag);
  if (war) {
    const wSide = warSide(war, wTag);
    const attLoss = (b.attacker.tag === wTag ? winSide.losses : loseSide.losses) * scale;
    const defLoss = (b.attacker.tag === wTag ? loseSide.losses : winSide.losses) * scale;
    const attIsWarAtt = warSide(war, b.attacker.tag) === 'attackers';
    war.losses.attackers += attIsWarAtt ? attLoss : defLoss;
    war.losses.defenders += attIsWarAtt ? defLoss : attLoss;
    // Muharebe skoru: zafer büyüklüğüne göre
    const magnitude = Math.min(6, 1 + (loseSide.losses * scale) / 20000);
    war.battleScore += (wSide === 'attackers' ? 1 : -1) * magnitude;
    war.battleScore = Math.max(-40, Math.min(40, war.battleScore));
  }
  // Savaş yorgunluğu
  for (const side of [winSide, loseSide]) {
    const c = s.countries[side.tag];
    if (!c) continue;
    const mp = Math.max(1000, maxManpower(ctx, side.tag));
    c.warExhaustion = Math.min(100, c.warExhaustion + ((side.losses * scale) / mp) * 25 + (side === loseSide ? 0.5 : 0.1));
  }

  const report: BattleReport = {
    id: b.id,
    location: b.location,
    naval: b.naval,
    startDay: b.startDay,
    endDay: s.day,
    attacker: { ...b.attacker },
    defender: { ...b.defender },
    winner,
    terrain: b.terrain,
    fort: b.fort,
  };
  s.battleReports.push(report);
  if (s.battleReports.length > 60) s.battleReports.shift();
  delete s.battles[b.id];

  const place = b.location < w.P ? w.data.provinces[b.location].name : '';
  const involves = [b.attacker.tag, b.defender.tag, ...[...att, ...def].map((x) => x.owner)];
  notify(
    ctx,
    'battle',
    'notif.battleEnded',
    {
      place,
      winner: s.countries[wTag]?.name ?? wTag,
      loser: s.countries[lTag]?.name ?? lTag,
      wl: Math.round(winSide.losses * scale),
      ll: Math.round(loseSide.losses * scale),
    },
    { severity: involves.includes(s.player) ? (wTag === s.player || winners.some((x) => x.owner === s.player) ? 'good' : 'bad') : 'info', involves, focus: { battle: b.id, province: b.location < w.P ? b.location : undefined } },
  );
}

function retreatNaval(ctx: Ctx, a: Army): number {
  const { w, s } = ctx;
  // Önce dost liman, yoksa düşman donanması olmayan komşu deniz düğümü
  const seen = new Set<number>([a.location]);
  let frontier = [a.location];
  for (let depth = 0; depth < 12 && frontier.length; depth++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (let e = w.edgeStart[u]; e < w.edgeStart[u + 1]; e++) {
        const v = w.edgeTo[e];
        if (seen.has(v)) continue;
        seen.add(v);
        if (v < w.P) {
          if (s.provinces[v].controller === a.owner) return v;
          continue;
        }
        next.push(v);
      }
    }
    frontier = next;
  }
  for (let e = w.edgeStart[a.location]; e < w.edgeStart[a.location + 1]; e++) {
    const v = w.edgeTo[e];
    if (v >= w.P && !armiesAt(ctx, v).some((x) => x.isNavy && hostileArmies(ctx, a, x))) return v;
  }
  return -1;
}

/** Tüm düğümlerde muharebe başlatılmamış düşman orduları kontrol et */
export function detectBattles(ctx: Ctx): void {
  const seen = new Set<number>();
  for (const a of Object.values(ctx.s.armies)) {
    if (seen.has(a.location)) continue;
    seen.add(a.location);
    const here = armiesAt(ctx, a.location);
    if (here.length < 2) continue;
    if (here.some((x) => !x.battle && here.some((y) => y !== x && hostileArmies(ctx, x, y) && x.isNavy === y.isNavy))) {
      engageAt(ctx, a.location, null);
    }
  }
}
