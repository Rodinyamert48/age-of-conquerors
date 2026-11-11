/**
 * Yapay zekâ: ordu büyüklüğü, asker toplama ve ordulara emir verme.
 * Savaşta: tehdit altındaki kendi bölgelerini savun, zayıf düşman ordularına saldır,
 * değerli düşman bölgelerini kuşat; aynı hedefe gereğinden fazla ordu gönderme.
 * Barışta: orduları en büyük tehdide bakan sınırlarda konuşlandır.
 */
import type { Army, Country, Tag, UnitType } from '../types';
import { armiesAt, armiesOf, getMods, provincesOf, type Ctx } from '../ctx';
import {
  armyPower,
  armySoldiers,
  atWar,
  enemiesOf,
  fortLevel,
  hostileArmies,
  isAtWar,
  isFriendly,
  landPower,
  REBEL_TAG,
} from '../query';
import { findPath, reachable, nearestFriendlyProvince, supplyLimit } from '../movement';
import { mergeInto, maxRecruitAmount, recruitAvailability, startRecruit, unitAvailable } from '../construction';
import { unitUpkeep, B_MIL, B_PORT } from '../economy';
import { provinceValue, hasClaimOrCore } from '../war';
import { biggestThreat, coalitionStrength } from '../diplomacy';
import { random } from '../rng';
import { assault, assaultChance } from '../siege';
import { TERRAIN_DEFS } from '../defs/terrain';

function diffParams(ctx: Ctx) {
  const d = ctx.s.rules.difficulty;
  return {
    searchDays: d === 'hard' ? 60 : d === 'easy' ? 25 : 40,
    attackRatio: d === 'hard' ? 1.15 : d === 'easy' ? 1.6 : 1.3,
    noise: d === 'easy' ? 0.5 : d === 'hard' ? 0.05 : 0.2,
    terrainAware: d !== 'easy',
    focusFire: d === 'hard',
    assaults: d !== 'easy',
  };
}

// ---------------------------------------------------------------------------
// Asker toplama
// ---------------------------------------------------------------------------
function desiredMix(ctx: Ctx, tag: Tag): [UnitType, number][] {
  const mix: [UnitType, number][] = [];
  const has = (u: UnitType) => unitAvailable(ctx, tag, u);
  mix.push(['infantry', 0.55]);
  if (has('artillery')) mix.push(['artillery', 0.15]);
  if (has('armor')) mix.push(['armor', 0.12]);
  else if (has('cavalry')) mix.push(['cavalry', 0.12]);
  if (has('light')) mix.push(['light', 0.08]);
  if (has('air')) mix.push(['air', 0.06]);
  else if (has('siege') && !has('artillery')) mix.push(['siege', 0.06]);
  return mix;
}

export function aiRecruit(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  if (c.bankruptUntil > s.day) return;
  const tag = c.tag;
  const war = isAtWar(ctx, tag);
  const income = Math.max(1e-6, c.budget.income);
  const landUpkeep = c.budget.armyUpkeep;
  const maxShare = war ? 0.55 : c.ai.focus === 'military' ? 0.3 : 0.22;
  const budgetRoom = income * maxShare - landUpkeep;
  // Tehdit
  let threat = 0;
  for (const e of enemiesOf(ctx, tag)) threat = Math.max(threat, coalitionStrength(ctx, e));
  const bt = biggestThreat(ctx, tag);
  if (bt) threat = Math.max(threat, landPower(ctx, bt.tag) * 0.8);
  const mine = landPower(ctx, tag);
  const need = war ? threat * 1.2 : threat * 0.6;
  // Barışta ve fazla bütçe yoksa küçük toplama
  if (mine >= need && !war) {
    // Aşırı ordu: bütçe açığında terhis
    if (c.budget.balance < 0 && c.treasury < 0 && landUpkeep > income * 0.3) aiDisband(ctx, c, 0.15);
    return;
  }
  if (budgetRoom <= 0) return;
  if (c.treasury < income * (war ? 0.2 : 1)) return;
  // Toplama yeri: başkent veya askerî tesisi olan en kalabalık bölge
  const provs = provincesOf(ctx, tag).filter((p) => s.provinces[p].controller === tag && !s.provinces[p].siege);
  if (!provs.length) return;
  provs.sort((a, b) => s.provinces[b].buildings[B_MIL] * 1e9 + s.provinces[b].pop - (s.provinces[a].buildings[B_MIL] * 1e9 + s.provinces[a].pop));
  const sites = provs.slice(0, 3);
  // Bütçenin elverdiği asker sayısı
  const perSoldier = unitUpkeep(ctx, tag, 'infantry');
  let soldiers = Math.min(budgetRoom / Math.max(1e-9, perSoldier) * 0.5, c.manpower * 0.6);
  if (soldiers < 1000) return;
  const mix = desiredMix(ctx, tag);
  for (const [unit, share] of mix) {
    let amount = Math.floor((soldiers * share) / 1000) * 1000;
    if (amount < 1000) continue;
    for (const site of sites) {
      const cap = maxRecruitAmount(ctx, site, unit);
      const n = Math.min(amount, cap);
      if (n < 1000) continue;
      const av = recruitAvailability(ctx, tag, site, unit, n);
      if (!av.ok) continue;
      if (c.treasury - av.cost < -income * 2) continue;
      startRecruit(ctx, tag, site, unit, n);
      amount -= n;
      if (amount < 1000) break;
    }
  }
  void soldiers;
  soldiers = 0;
  // Donanma: kıyı ülkesi, düşük donanma
  const port = provs.find((p) => s.provinces[p].buildings[B_PORT] > 0);
  if (port !== undefined && c.ai.focus !== 'economy' && random(s) < 0.15) {
    const fleets = armiesOf(ctx, tag).filter((a) => a.isNavy);
    const ships = fleets.reduce((n, a) => n + a.units.navy, 0);
    const wantShips = Math.min(40, Math.max(2, Math.round(Math.sqrt(income) * 0.6)));
    if (ships < wantShips) {
      const av = recruitAvailability(ctx, tag, port, 'navy', Math.min(3, wantShips - ships));
      if (av.ok && c.treasury - av.cost > income) startRecruit(ctx, tag, port, 'navy', Math.min(3, wantShips - ships));
    }
  }
}

export function aiDisband(ctx: Ctx, c: Country, fraction: number): void {
  const armies = armiesOf(ctx, c.tag).filter((a) => !a.isNavy && !a.battle);
  if (!armies.length) return;
  armies.sort((a, b) => armySoldiers(b) - armySoldiers(a));
  const a = armies[0];
  for (const t of Object.keys(a.units) as UnitType[]) a.units[t] = Math.floor(a.units[t] * (1 - fraction));
  c.manpower += armySoldiers(a) * fraction * 0.5;
}

// ---------------------------------------------------------------------------
// Emirler
// ---------------------------------------------------------------------------
function enemyPowerNear(ctx: Ctx, tag: Tag, p: number): number {
  let pw = 0;
  for (const a of armiesAt(ctx, p)) if (!a.isNavy && a.owner !== tag && atWar(ctx, tag, a.owner)) pw += armyPower(ctx, a);
  const wp = ctx.w.data.provinces[p];
  for (const j of wp.adj) for (const a of armiesAt(ctx, j)) if (!a.isNavy && a.owner !== tag && atWar(ctx, tag, a.owner)) pw += armyPower(ctx, a) * 0.5;
  return pw;
}

function sendTo(ctx: Ctx, a: Army, target: number): boolean {
  if (a.location === target) return true;
  const r = findPath(ctx, a, target);
  if (!r) return false;
  a.path = r.path;
  a.progress = 0;
  a.aiTarget = target;
  return true;
}

export function aiArmies(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  const tag = c.tag;
  const armies = armiesOf(ctx, tag).filter((a) => !a.battle);
  if (!armies.length) return;
  const dp = diffParams(ctx);
  // Aynı bölgedeki boştaki orduları birleştir
  const byLoc = new Map<number, Army[]>();
  for (const a of armies) {
    if (a.path.length || a.isNavy) continue;
    const arr = byLoc.get(a.location) ?? [];
    arr.push(a);
    byLoc.set(a.location, arr);
  }
  for (const [loc, list] of byLoc) {
    if (list.length < 2 || loc >= ctx.w.P) continue;
    const total = list.reduce((n, a) => n + armySoldiers(a), 0);
    if (total > supplyLimit(ctx, loc, tag) * 1.5) continue;
    for (let i = 1; i < list.length; i++) if (s.armies[list[i].id]) mergeInto(ctx, list[0], list[i]);
  }
  const live = armiesOf(ctx, tag).filter((a) => !a.battle);
  const war = isAtWar(ctx, tag) || tag === REBEL_TAG || c.rebelMovement;
  if (war) aiWarOrders(ctx, c, live.filter((a) => !a.isNavy), dp);
  else aiPeaceOrders(ctx, c, live.filter((a) => !a.isNavy));
  aiFleets(ctx, c, live.filter((a) => a.isNavy));
}

function aiWarOrders(ctx: Ctx, c: Country, armies: Army[], dp: ReturnType<typeof diffParams>): void {
  const s = ctx.s;
  const { w } = ctx;
  const tag = c.tag;
  const assigned = new Map<number, number>();
  // Hücum fırsatları
  if (dp.assaults) {
    for (const a of armies) {
      if (a.path.length || a.location >= w.P) continue;
      const ps = s.provinces[a.location];
      if (!ps.siege || ps.siege.by !== tag) continue;
      const est = assaultChance(ctx, a.location);
      if (est && est.chance > 0.6 && est.casualties < armySoldiers(a) * 0.15) assault(ctx, a.location);
    }
  }
  const sorted = [...armies].sort((x, y) => armySoldiers(y) - armySoldiers(x)).slice(0, 16);
  for (const a of sorted) {
    if (!s.armies[a.id] || a.battle) continue;
    // Hareket halindeyse ve hedef hâlâ geçerliyse dokunma
    if (a.path.length && a.aiTarget !== null) {
      const t = a.aiTarget;
      const stillValid = t < w.P && (atWar(ctx, tag, s.provinces[t].controller) || armiesAt(ctx, t).some((x) => hostileArmies(ctx, a, x)) || s.provinces[t].owner === tag);
      if (stillValid) {
        assigned.set(t, (assigned.get(t) ?? 0) + 1);
        continue;
      }
    }
    // Kuşatmadaysa ve kuşatma ilerliyorsa devam
    if (!a.path.length && a.location < w.P) {
      const ps = s.provinces[a.location];
      if (ps.siege && ps.siege.by === tag && ps.siege.progress > 0) {
        assigned.set(a.location, (assigned.get(a.location) ?? 0) + 1);
        continue;
      }
    }
    const myPower = armyPower(ctx, a);
    // Zayıf ordu: geri çekil ve toparlan
    if (a.morale < 0.35) {
      if (a.location < w.P && s.provinces[a.location].controller === tag && !enemyPowerNear(ctx, tag, a.location)) continue;
      const home = nearestFriendlyProvince(ctx, tag, a.location, true);
      if (home >= 0) sendTo(ctx, a, home);
      continue;
    }
    const reach = reachable(ctx, a, dp.searchDays, false);
    let best = -1;
    let bestScore = -Infinity;
    for (const [node, days] of reach) {
      if (node >= w.P) continue;
      const ps = s.provinces[node];
      let score = -Infinity;
      const here = armiesAt(ctx, node).filter((x) => !x.isNavy && hostileArmies(ctx, a, x));
      if (here.length) {
        const ep = here.reduce((n, x) => n + armyPower(ctx, x), 0);
        let ratio = myPower / Math.max(1e-6, ep);
        if (dp.terrainAware) ratio /= 1 + TERRAIN_DEFS[w.terrain[node]].defense * 0.6;
        if (ratio >= dp.attackRatio) score = 30 + Math.min(40, ep) * 0.5 - days * 0.8;
        if (ps.owner === tag) score += 25; // kendi toprağını savun
      } else if (ps.controller !== tag && (atWar(ctx, tag, ps.controller) || (ps.controller === REBEL_TAG && ps.owner === tag))) {
        const v = provinceValue(ctx, node);
        const fort = fortLevel(ctx, node);
        let sc = v * 6 * (hasClaimOrCore(ctx, tag, node) ? 2 : 1) * (ps.owner === tag ? 2.5 : 1);
        sc /= 1 + days / 6 + fort * 1.5;
        const danger = enemyPowerNear(ctx, tag, node);
        if (danger > myPower * 1.2) sc *= 0.2;
        score = sc;
      }
      if (score === -Infinity) continue;
      const n = assigned.get(node) ?? 0;
      if (n > 0) score *= dp.focusFire && here.length ? 0.9 : 0.35 / n;
      score *= 1 + (random(s) - 0.5) * dp.noise;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    if (best >= 0) {
      if (sendTo(ctx, a, best)) assigned.set(best, (assigned.get(best) ?? 0) + 1);
    } else if (a.location >= w.P || s.provinces[a.location].controller !== tag) {
      // Hedef yok: güvenli dost bölgeye
      const home = nearestFriendlyProvince(ctx, tag, a.location, true);
      if (home >= 0) sendTo(ctx, a, home);
    } else {
      // Deniz aşırı düşman: kıyıdan çıkarma dene (yalnızca güçlü ordular)
      const enemies = [...enemiesOf(ctx, tag)].filter((e) => e !== REBEL_TAG);
      if (enemies.length && myPower > 3 && random(s) < 0.25) {
        const e = enemies[Math.floor(random(s) * enemies.length)];
        const targets = provincesOf(ctx, e).filter((p) => s.provinces[p].controller === e && ctx.w.coastal[p] && !armiesAt(ctx, p).some((x) => !x.isNavy && x.owner === e));
        if (targets.length) {
          targets.sort((x, y) => provinceValue(ctx, y) - provinceValue(ctx, x));
          const t = targets[Math.min(targets.length - 1, Math.floor(random(s) * 3))];
          const r = findPath(ctx, a, t, { allowSea: true });
          if (r && r.days < 90) {
            a.path = r.path;
            a.aiTarget = t;
          }
        }
      }
    }
  }
}

function aiPeaceOrders(ctx: Ctx, c: Country, armies: Army[]): void {
  const s = ctx.s;
  const tag = c.tag;
  if (s.day % 30 !== Math.abs(hashTag(tag)) % 30 && armies.every((a) => a.aiTarget !== null || a.path.length)) return;
  const threat = biggestThreat(ctx, tag);
  let posts: number[] = [];
  if (threat && threat.ratio > 0.5) {
    posts = provincesOf(ctx, tag).filter((p) => ctx.w.data.provinces[p].adj.some((j) => s.provinces[j].owner === threat.tag));
    posts.sort((a, b) => provinceValue(ctx, b) - provinceValue(ctx, a));
    posts = posts.slice(0, Math.max(1, Math.min(4, armies.length)));
  }
  if (!posts.length && c.capital >= 0) posts = [c.capital];
  if (!posts.length) return;
  armies.forEach((a, i) => {
    if (a.path.length) return;
    const target = posts[i % posts.length];
    if (a.location !== target && a.aiTarget !== target) sendTo(ctx, a, target);
    else a.aiTarget = target;
  });
}

function hashTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return h;
}

function aiFleets(ctx: Ctx, c: Country, fleets: Army[]): void {
  const s = ctx.s;
  const { w } = ctx;
  if (!fleets.length) return;
  const tag = c.tag;
  const war = isAtWar(ctx, tag);
  for (const f of fleets) {
    if (f.path.length || f.battle) continue;
    if (!war) {
      // Barış: ana limanda bekle
      if (f.location >= w.P && c.capital >= 0) {
        const home = nearestFriendlyProvince(ctx, tag, f.location, false);
        if (home >= 0 && w.coastal[home]) sendTo(ctx, f, home);
      }
      continue;
    }
    const reach = reachable(ctx, f, 12, true);
    const myPower = armyPower(ctx, f);
    let best = -1;
    let bestScore = 0;
    for (const [node, days] of reach) {
      if (node < w.P) continue;
      const enemies = armiesAt(ctx, node).filter((x) => x.isNavy && hostileArmies(ctx, f, x));
      if (enemies.length) {
        const ep = enemies.reduce((n, x) => n + armyPower(ctx, x), 0);
        if (myPower > ep * 1.3) {
          const sc = 50 - days;
          if (sc > bestScore) {
            bestScore = sc;
            best = node;
          }
        }
        continue;
      }
      // Abluka: düşman kıyısına komşu deniz düğümü
      let blockade = 0;
      for (let e = w.edgeStart[node]; e < w.edgeStart[node + 1]; e++) {
        const p = w.edgeTo[e];
        if (p < w.P && atWar(ctx, tag, s.provinces[p].owner)) blockade += provinceValue(ctx, p);
      }
      const sc = blockade * 2 - days;
      if (blockade > 0 && sc > bestScore) {
        bestScore = sc;
        best = node;
      }
    }
    if (best >= 0) sendTo(ctx, f, best);
  }
}

/** İsyancı ordular: en yakın hedef ülke bölgesine ilerler */
export function aiRebels(ctx: Ctx): void {
  const s = ctx.s;
  const { w } = ctx;
  for (const a of Object.values(s.armies)) {
    const oc = s.countries[a.owner];
    if (!(a.owner === REBEL_TAG || oc?.rebelMovement)) continue;
    if (a.battle || a.path.length) continue;
    if (a.location < w.P) {
      const ps = s.provinces[a.location];
      if (ps.siege && ps.siege.by === a.owner) continue;
      if (ps.controller !== a.owner && atWar(ctx, a.owner, ps.controller)) continue; // kuşatma başlayacak
    }
    const reach = reachable(ctx, a, 20, false);
    let best = -1;
    let bestScore = -Infinity;
    for (const [node, days] of reach) {
      if (node >= w.P) continue;
      const ps = s.provinces[node];
      if (ps.controller === a.owner || !atWar(ctx, a.owner, ps.controller)) continue;
      const defenders = armiesAt(ctx, node).filter((x) => hostileArmies(ctx, a, x));
      const dpow = defenders.reduce((n, x) => n + armyPower(ctx, x), 0);
      if (dpow > armyPower(ctx, a)) continue;
      let sc = provinceValue(ctx, node) - days * 0.3;
      if (oc?.rebelMovement && ps.cores.includes(a.owner)) sc += 5;
      if (sc > bestScore) {
        bestScore = sc;
        best = node;
      }
    }
    if (best >= 0) sendTo(ctx, a, best);
  }
}

export function isFriendlyTag(ctx: Ctx, a: Tag, b: Tag): boolean {
  return isFriendly(ctx, a, b);
}

export const _mods = getMods;
