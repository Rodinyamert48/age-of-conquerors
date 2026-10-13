/**
 * Yapay zekâ diplomasisi: ittifak arayışı, anlaşmalar, ilişki geliştirme, savaş ilanı ve barış.
 */
import type { Country, PeaceTerm, Tag, War } from '../types';
import { allianceOf, findTreaty, neighborCountries, provincesOf, warsOf, type Ctx } from '../ctx';
import {
  atWar,
  enemiesIn,
  isAtWar,
  isFriendly,
  landPower,
  overlordOf,
  relation,
  REBEL_TAG,
  sameAlliance,
  strategicStrength,
  warSide,
} from '../query';
import { biggestThreat, coalitionStrength, evaluateProposal, offensiveStrength, performAction } from '../diplomacy';
import { applyPeace, canDeclareWar, declareWar, evaluatePeace, hasCasusBelli, provinceValue, scoreFor, termCost, validTerm, hasClaimOrCore } from '../war';
import { chance, random } from '../rng';
import { notify, newId } from '../notify';
import { monthsCrossed } from '../calendar';

function diffWar(ctx: Ctx, target: Tag) {
  const d = ctx.s.rules.difficulty;
  const vsPlayer = target === ctx.s.player;
  if (d === 'easy') return vsPlayer ? 3.2 : 2.2;
  if (d === 'hard') return vsPlayer ? 1.35 : 1.6;
  return vsPlayer ? 2.0 : 1.8;
}

// ---------------------------------------------------------------------------
// Barış dışı diplomasi
// ---------------------------------------------------------------------------
export function aiDiplomacy(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  const tag = c.tag;
  if (tag === REBEL_TAG || c.rebelMovement) return;
  const vassal = !!overlordOf(ctx, tag);
  const tryPropose = (to: Tag, type: Parameters<typeof performAction>[3]) => {
    const key = `${type}|${to}`;
    if ((c.ai.cooldowns[key] ?? -Infinity) > s.day) return false;
    // Yapay zekâ kendi değerlendirmesini önce simüle eder (karşı taraf yapay zekâysa)
    if (!s.countries[to].isPlayer) {
      const ev = evaluateProposal(ctx, tag, to, type);
      if (!ev.accept) {
        c.ai.cooldowns[key] = s.day + 120;
        return false;
      }
    } else {
      // oyuncuya teklif: kendi çıkarı yeterli mi
      c.ai.cooldowns[key] = s.day + 240;
    }
    const r = performAction(ctx, tag, to, type);
    return r.ok && r.accepted !== false;
  };

  // Rakip belirle
  const threat = biggestThreat(ctx, tag);
  const neighbors = [...neighborCountries(ctx, tag)].filter((n) => s.countries[n]?.alive && n !== REBEL_TAG);
  if (!c.ai.rival || !s.countries[c.ai.rival]?.alive) {
    let worst: Tag | null = null;
    let wv = -20;
    for (const n of neighbors) {
      const r = relation(s, tag, n);
      if (r < wv) {
        wv = r;
        worst = n;
      }
    }
    c.ai.rival = worst;
  }

  // Tehdit varsa ittifak / savunma paktı / saldırmazlık
  if (threat && threat.ratio > 1.2 && !vassal) {
    const candidates = Object.values(s.countries)
      .filter((x) => x.alive && x.tag !== tag && x.tag !== threat.tag && x.tag !== REBEL_TAG && !x.rebelMovement && !isFriendly(ctx, x.tag, threat.tag) && relation(s, tag, x.tag) > 10)
      .sort((a, b) => strategicStrength(ctx, b.tag) - strategicStrength(ctx, a.tag))
      .slice(0, 4);
    for (const x of candidates) {
      if (!allianceOf(ctx, tag) || allianceOf(ctx, tag)?.leader === tag) {
        const xa = allianceOf(ctx, x.tag);
        const target = xa ? xa.leader : x.tag;
        if (!sameAlliance(ctx, tag, target) && !allianceOf(ctx, tag) && tryPropose(target, 'alliance')) break;
      }
      if (!findTreaty(ctx, 'defensive', tag, x.tag) && tryPropose(x.tag, 'defensive')) break;
    }
    if (relation(s, tag, threat.tag) > -40 && !findTreaty(ctx, 'nap', tag, threat.tag) && !atWar(ctx, tag, threat.tag)) tryPropose(threat.tag, 'nap');
  }

  // Ticaret anlaşmaları
  const tradeCount = s.treaties.filter((t) => t.type === 'trade' && (t.a === tag || t.b === tag)).length;
  const maxTrade = 4 + Math.min(10, Math.round(Math.log2(1 + provincesOf(ctx, tag).length) * 2));
  if (tradeCount < maxTrade && !isAtWar(ctx, tag)) {
    const partners = Object.values(s.countries)
      .filter((x) => x.alive && x.tag !== tag && x.tag !== REBEL_TAG && !x.rebelMovement && !findTreaty(ctx, 'trade', tag, x.tag) && relation(s, tag, x.tag) > 5 && !atWar(ctx, tag, x.tag))
      .sort((a, b) => relation(s, tag, b.tag) - relation(s, tag, a.tag))
      .slice(0, 2);
    for (const p of partners) tryPropose(p.tag, 'trade');
  }

  // İlişki geliştirme (hazine uygunsa)
  if (c.treasury > c.budget.income * 3) {
    const targets = neighbors.filter((n) => relation(s, tag, n) < 30 && n !== c.ai.rival).slice(0, 1);
    if (threat && threat.ratio > 1 && relation(s, tag, threat.tag) < 20) targets.push(threat.tag);
    for (const t of targets) performAction(ctx, tag, t, 'improve');
  }

  // Normalleşme: savaşta değilsek ve ilişkiler çok kötüyse
  for (const n of neighbors) {
    if (relation(s, tag, n) < -70 && !atWar(ctx, tag, n) && c.warExhaustion > 30) {
      tryPropose(n, 'normalize');
      break;
    }
  }

  // Savaş ilanı
  aiConsiderWar(ctx, c);
}

function aiConsiderWar(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  const tag = c.tag;
  if (overlordOf(ctx, tag)) return;
  if (c.stability < 40 || c.warExhaustion > 20 || c.treasury < 0 || c.bankruptUntil > s.day) return;
  const wars = warsOf(ctx, tag).filter((w) => w.goal.type !== 'rebellion');
  if (wars.length) return;
  if (s.day - c.ai.lastWarDecl < 365 * 3) return;
  const aggression = c.ai.aggression * s.rules.aiAggression;
  if (!chance(s, aggression * 0.35)) return;
  const myPower = offensiveStrength(ctx, tag) * (0.8 + c.ai.aggression * 0.4);
  let best: { tag: Tag; score: number } | null = null;
  for (const n of neighborCountries(ctx, tag)) {
    const nc = s.countries[n];
    if (!nc?.alive || n === REBEL_TAG || nc.rebelMovement) continue;
    const chk = canDeclareWar(ctx, tag, n);
    if (!chk.ok) continue;
    // Ateşkes ve saldırmazlık bozulmaz (yalnızca çok saldırgan kişilikler)
    if (chk.breaks.some((t) => t.type === 'truce')) continue;
    if (chk.breaks.some((t) => t.type === 'nap') && c.ai.aggression < 0.85) continue;
    const rel = relation(s, tag, n);
    if (rel > 0 && !hasCasusBelli(ctx, tag, n)) continue;
    const their = coalitionStrength(ctx, n);
    const ratio = myPower / Math.max(1, their);
    const need = diffWar(ctx, n);
    if (ratio < need) continue;
    let score = ratio - need + (hasCasusBelli(ctx, tag, n) ? 1 : 0) - rel / 100;
    // Kazanç: hedefin zenginliği
    score += Math.log10(1 + provincesOf(ctx, n).length) * 0.3;
    if (!best || score > best.score) best = { tag: n, score };
  }
  if (!best) return;
  // Gerekçe yoksa önce toprak talebinde bulun, sonraki değerlendirmede saldır
  if (!hasCasusBelli(ctx, tag, best.tag)) {
    const border = provincesOf(ctx, best.tag)
      .filter((p) => ctx.w.data.provinces[p].adj.some((j) => s.provinces[j].owner === tag))
      .sort((a, b) => provinceValue(ctx, b) - provinceValue(ctx, a));
    if (border.length) {
      performAction(ctx, tag, best.tag, 'claim', border[0]);
      c.ai.warTarget = best.tag;
    }
    return;
  }
  const war = declareWar(ctx, tag, best.tag, { type: 'conquest' });
  if (war) {
    c.ai.lastWarDecl = s.day;
    c.ai.warTarget = best.tag;
  }
}

// ---------------------------------------------------------------------------
// Barış
// ---------------------------------------------------------------------------
function demandTerms(ctx: Ctx, war: War, winner: Tag, loser: Tag, budget: number): PeaceTerm[] {
  const s = ctx.s;
  const terms: PeaceTerm[] = [];
  const winnerSide = warSide(war, winner);
  const occupied = provincesOf(ctx, loser).filter((p) => {
    const ctrl = s.provinces[p].controller;
    return winnerSide === 'attackers' ? war.attackers.includes(ctrl) : war.defenders.includes(ctrl);
  });
  const fullyOccupied = occupied.length === provincesOf(ctx, loser).length;
  if (fullyOccupied && provincesOf(ctx, loser).length <= Math.max(6, provincesOf(ctx, winner).length * 0.5) && budget >= 100) {
    return [{ type: 'annex' }];
  }
  // Bitişik, çekirdek/talep, değerli bölgeler önce
  const adjacentToWinner = (p: number) => ctx.w.data.provinces[p].adj.concat(ctx.w.data.provinces[p].cross).some((j) => s.provinces[j].owner === winner);
  occupied.sort((a, b) => {
    const sa = (hasClaimOrCore(ctx, winner, a) ? 100 : 0) + (adjacentToWinner(a) ? 50 : 0) + provinceValue(ctx, a);
    const sb = (hasClaimOrCore(ctx, winner, b) ? 100 : 0) + (adjacentToWinner(b) ? 50 : 0) + provinceValue(ctx, b);
    return sb - sa;
  });
  let used = 0;
  for (const p of occupied) {
    const t: PeaceTerm = { type: 'province', province: p };
    if (!validTerm(ctx, war, winner, loser, t)) continue;
    const cost = termCost(ctx, war, winner, loser, t);
    if (used + cost > budget) continue;
    terms.push(t);
    used += cost;
    if (terms.length >= 12) break;
  }
  // Kalan skor: tazminat
  const lc = s.countries[loser];
  if (budget - used > 10 && lc) {
    const amount = Math.max(0, lc.budget.income * 0.1);
    const t: PeaceTerm = { type: 'reparations', amount, months: 60 };
    const cost = termCost(ctx, war, winner, loser, t);
    if (amount > 0 && used + cost <= budget) terms.push(t);
  }
  return terms;
}

function offerPeace(ctx: Ctx, war: War, from: Tag, to: Tag, beneficiary: Tag, terms: PeaceTerm[]): boolean {
  const s = ctx.s;
  const loser = beneficiary === from ? to : from;
  const separate = !(war.attackerLeader === loser || war.defenderLeader === loser) || !(war.attackerLeader === beneficiary || war.defenderLeader === beneficiary);
  if (s.countries[to].isPlayer) {
    if (s.peaceOffers.some((o) => o.warId === war.id && o.from === from)) return false;
    s.peaceOffers.push({ id: newId(ctx, 'po'), warId: war.id, from, to, beneficiary, terms, day: s.day, expires: s.day + 30 });
    notify(ctx, 'peace', 'notif.peaceOffer', { from: s.countries[from].name, war: war.name }, { severity: 'info', involves: [to], focus: { war: war.id } });
    return true;
  }
  const ev = evaluatePeace(ctx, war, from, to, beneficiary, terms);
  if (ev.accept) {
    applyPeace(ctx, war, beneficiary, loser, terms, separate);
    return true;
  }
  if (ev.counter && ev.counter.length && beneficiary === from) {
    // Karşı teklifi kabul et
    applyPeace(ctx, war, beneficiary, loser, ev.counter, separate);
    return true;
  }
  return false;
}

export function aiPeace(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  const tag = c.tag;
  for (const war of warsOf(ctx, tag)) {
    if (!s.wars[war.id]) continue;
    if (war.goal.type === 'rebellion') continue;
    const side = warSide(war, tag);
    if (!side) continue;
    const isLeader = war.attackerLeader === tag || war.defenderLeader === tag;
    const enemyLeader = side === 'attackers' ? war.defenderLeader : war.attackerLeader;
    const myScore = scoreFor(war, tag);
    const months = monthsCrossed(war.startDay, s.day);
    if (war.goal.type === 'independence' && tag === war.attackerLeader) {
      // Bağımsızlık hareketi: yeterli kontrol varsa bağımsızlık talep et
      if (myScore >= 20) offerPeace(ctx, war, tag, enemyLeader, tag, [{ type: 'release', nation: tag }]);
      continue;
    }
    if (isLeader) {
      if (myScore >= 25 && (months >= 4 || myScore >= 80)) {
        const terms = demandTerms(ctx, war, tag, enemyLeader, myScore + (s.countries[enemyLeader]?.warExhaustion ?? 0) * 0.3);
        if (terms.length) {
          if (offerPeace(ctx, war, tag, enemyLeader, tag, terms)) continue;
        }
      }
      const losing = myScore <= -25 && (c.warExhaustion > 30 || myScore <= -60);
      const stalemate = months > 36 && Math.abs(myScore) < 15;
      if (losing) {
        // Düşmanın işgal ettiği bölgeleri vererek barış
        const terms = demandTerms(ctx, war, enemyLeader, tag, -myScore);
        offerPeace(ctx, war, tag, enemyLeader, enemyLeader, terms);
      } else if (stalemate || (c.warExhaustion > 60 && myScore < 10)) {
        offerPeace(ctx, war, tag, enemyLeader, enemyLeader, []);
      }
    } else {
      // Küçük katılımcı: ağır işgalde ayrı barış
      const provs = provincesOf(ctx, tag);
      const occ = provs.length ? provs.filter((p) => s.provinces[p].controller !== tag).length / provs.length : 0;
      if (occ > 0.5 || c.warExhaustion > 70) {
        const terms = demandTerms(ctx, war, enemyLeader, tag, occ * 100);
        offerPeace(ctx, war, tag, enemyLeader, enemyLeader, terms);
      }
    }
    void enemiesIn;
    void landPower;
    void random;
  }
}
