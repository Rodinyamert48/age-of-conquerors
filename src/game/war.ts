/**
 * Savaşlar: ilan, katılım, savaş skoru, barış şartları, toprak devri, ilhak ve ülkenin ortadan kalkması.
 */
import type { PeaceTerm, Tag, Treaty, War, WarGoal } from './types';
import {
  allianceOf,
  armiesOf,
  findTreaty,
  invalidateArmies,
  invalidateDiplomacy,
  invalidateOwnership,
  provincesOf,
  warsOf,
  type Ctx,
} from './ctx';
import { addRelation, atWar, enemiesIn, isFriendly, overlordOf, relation, REBEL_TAG, setRelation, vassalsOf, warSide } from './query';
import { notify, newId } from './notify';
import { BAL } from './balance';
import { nearestFriendlyProvince } from './movement';
import { monthsCrossed, yearsBetween } from './calendar';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
export function provinceValue(ctx: Ctx, p: number): number {
  const s = ctx.s;
  const ps = s.provinces[p];
  const avg = s.meta.avgProvinceOutput || 1;
  const owner = s.countries[ps.owner];
  return (1 + Math.sqrt(Math.max(0, ps.output) / avg) * 2) * (owner && owner.capital === p ? 2 : 1);
}

export function relocateCapital(ctx: Ctx, tag: Tag): void {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c) return;
  let best = -1;
  let bestPop = -1;
  for (const p of provincesOf(ctx, tag)) {
    const ps = s.provinces[p];
    if (ps.controller !== tag) continue;
    if (ps.pop > bestPop) {
      bestPop = ps.pop;
      best = p;
    }
  }
  if (best < 0) {
    // Hiç kontrol edilen bölge yoksa sahip olunan en kalabalık bölge
    for (const p of provincesOf(ctx, tag)) if (s.provinces[p].pop > bestPop) [best, bestPop] = [p, s.provinces[p].pop];
  }
  if (best >= 0 && best !== c.capital) {
    c.capital = best;
    notify(ctx, 'province', 'notif.capitalMoved', { country: c.name, province: ctx.w.data.provinces[best].name }, { severity: 'bad', involves: [tag], focus: { province: best } });
  }
}

function addTreaty(ctx: Ctx, t: Omit<Treaty, 'id'>): Treaty {
  const tr: Treaty = { id: newId(ctx, 't'), ...t };
  ctx.s.treaties.push(tr);
  invalidateDiplomacy(ctx);
  return tr;
}

export function removeTreaties(ctx: Ctx, pred: (t: Treaty) => boolean): Treaty[] {
  const removed = ctx.s.treaties.filter(pred);
  if (removed.length) {
    ctx.s.treaties = ctx.s.treaties.filter((t) => !pred(t));
    invalidateDiplomacy(ctx);
  }
  return removed;
}

export function hasClaimOrCore(ctx: Ctx, tag: Tag, p: number): boolean {
  const c = ctx.s.countries[tag];
  return !!c && (c.claims.includes(p) || ctx.s.provinces[p].cores.includes(tag));
}

/** Saldıranın haklı gerekçesi var mı (talep veya çekirdek bölge) */
export function hasCasusBelli(ctx: Ctx, attacker: Tag, defender: Tag): boolean {
  for (const p of provincesOf(ctx, defender)) if (hasClaimOrCore(ctx, attacker, p)) return true;
  // Sürekli düşmanca ilişki (çok kötü ilişkiler) de gerekçe sayılır
  return relation(ctx.s, attacker, defender) <= -75;
}

// ---------------------------------------------------------------------------
// Savaş ilanı
// ---------------------------------------------------------------------------
export interface DeclareCheck {
  ok: boolean;
  error?: string;
  /** ilanla bozulacak antlaşmalar */
  breaks: Treaty[];
  justified: boolean;
}

export function canDeclareWar(ctx: Ctx, attacker: Tag, defender: Tag): DeclareCheck {
  const s = ctx.s;
  const a = s.countries[attacker];
  const d = s.countries[defender];
  const res: DeclareCheck = { ok: false, breaks: [], justified: false };
  if (!a?.alive || !d?.alive || attacker === defender) return { ...res, error: 'err.invalidTarget' };
  if (atWar(ctx, attacker, defender)) return { ...res, error: 'err.alreadyAtWar' };
  const al = allianceOf(ctx, attacker);
  if (al && al.members.includes(defender)) return { ...res, error: 'err.sameAlliance' };
  if (overlordOf(ctx, attacker)) return { ...res, error: 'err.vassalCannotDeclare' };
  if (findTreaty(ctx, 'vassal', attacker, defender) || findTreaty(ctx, 'vassal', defender, attacker)) return { ...res, error: 'err.vassalRelation' };
  if (findTreaty(ctx, 'defensive', attacker, defender)) return { ...res, error: 'err.hasDefensivePact' };
  for (const t of s.treaties) {
    const pair = (t.a === attacker && t.b === defender) || (t.a === defender && t.b === attacker);
    if (!pair) continue;
    if (t.type === 'nap' || t.type === 'truce' || t.type === 'access' || t.type === 'trade') res.breaks.push(t);
  }
  res.justified = hasCasusBelli(ctx, attacker, defender);
  res.ok = true;
  return res;
}

export function warName(ctx: Ctx, attacker: Tag, defender: Tag): string {
  const s = ctx.s;
  return `${s.countries[attacker]?.name ?? attacker}–${s.countries[defender]?.name ?? defender}`;
}

export function declareWar(ctx: Ctx, attacker: Tag, defender: Tag, goal: WarGoal = { type: 'conquest' }, opts: { silentAllies?: boolean } = {}): War | null {
  const s = ctx.s;
  const chk = canDeclareWar(ctx, attacker, defender);
  if (!chk.ok) return null;
  const a = s.countries[attacker];
  // Antlaşma ihlalleri
  for (const t of chk.breaks) {
    if (t.type === 'nap') {
      a.reputation = Math.max(-100, a.reputation - 25);
      a.stability = Math.max(0, a.stability - 10);
    } else if (t.type === 'truce') {
      a.reputation = Math.max(-100, a.reputation - 30);
      a.stability = Math.max(0, a.stability - 15);
    }
  }
  if (chk.breaks.length) removeTreaties(ctx, (t) => chk.breaks.includes(t));
  if (!chk.justified && goal.type !== 'rebellion' && goal.type !== 'independence' && goal.type !== 'scenario') {
    a.reputation = Math.max(-100, a.reputation - 15);
    a.stability = Math.max(0, a.stability - 8);
    for (const c of Object.values(s.countries)) if (c.alive && c.tag !== attacker && c.tag !== defender) addRelation(s, c.tag, attacker, -4);
  }
  const war: War = {
    id: newId(ctx, 'w'),
    name: goal.type === 'independence' ? (s.countries[attacker]?.name ?? attacker) : warName(ctx, attacker, defender),
    attackers: [attacker],
    defenders: [defender],
    attackerLeader: attacker,
    defenderLeader: defender,
    startDay: s.day,
    goal,
    score: 0,
    battleScore: 0,
    losses: { attackers: 0, defenders: 0 },
  };
  s.wars[war.id] = war;
  invalidateDiplomacy(ctx);
  setRelation(s, attacker, defender, Math.min(relation(s, attacker, defender), -60));
  notify(
    ctx,
    'war',
    goal.type === 'independence' ? 'notif.independenceWar' : goal.type === 'rebellion' ? 'notif.rebellionWar' : 'notif.warDeclared',
    { attacker: a.name, defender: s.countries[defender]?.name ?? defender },
    { severity: defender === s.player ? 'critical' : attacker === s.player ? 'info' : 'info', involves: [attacker, defender], global: goal.type !== 'rebellion', focus: { war: war.id } },
  );
  if (goal.type === 'rebellion' || goal.type === 'independence') return war;

  // Savunma yükümlülükleri: savunma paktları, ittifak üyeleri, efendi ve bağlılar otomatik katılır
  const defJoin = new Set<Tag>();
  for (const v of vassalsOf(ctx, defender)) defJoin.add(v);
  const ov = overlordOf(ctx, defender);
  if (ov) defJoin.add(ov);
  const dal = allianceOf(ctx, defender);
  if (dal) for (const m of dal.members) defJoin.add(m);
  for (const t of s.treaties) {
    if (t.type !== 'defensive') continue;
    if (t.a === defender) defJoin.add(t.b);
    if (t.b === defender) defJoin.add(t.a);
  }
  defJoin.delete(defender);
  defJoin.delete(attacker);
  for (const tag of [...defJoin].sort()) {
    if (!s.countries[tag]?.alive) continue;
    // Saldıranla ittifakı/paktı olan taraf tutmaz
    if (isFriendly(ctx, tag, attacker) || findTreaty(ctx, 'defensive', tag, attacker)) continue;
    joinWar(ctx, war, tag, 'defenders');
  }
  // Saldıranın bağlıları otomatik katılır; ittifak üyelerine çağrı gider
  for (const v of vassalsOf(ctx, attacker)) if (!war.defenders.includes(v)) joinWar(ctx, war, v, 'attackers');
  const aal = allianceOf(ctx, attacker);
  if (aal && !opts.silentAllies) {
    for (const m of aal.members) {
      if (m === attacker || war.attackers.includes(m) || war.defenders.includes(m)) continue;
      callToArms(ctx, war, attacker, m);
    }
  }
  return war;
}

/** Müttefiki saldırı savaşına çağır. Oyuncuya teklif olarak gider; yapay zekâ çıkarına göre karar verir. */
export function callToArms(ctx: Ctx, war: War, caller: Tag, ally: Tag): boolean {
  const s = ctx.s;
  if (!s.countries[ally]?.alive) return false;
  const side = warSide(war, caller);
  if (!side) return false;
  if (ally === s.player) {
    s.proposals.push({ id: newId(ctx, 'p'), from: caller, to: ally, type: 'callToArms', warId: war.id, day: s.day, expires: s.day + 30 });
    notify(ctx, 'diplomacy', 'notif.callToArms', { country: s.countries[caller].name, war: war.name }, { severity: 'info', involves: [ally] });
    return false;
  }
  const enemies = side === 'attackers' ? war.defenders : war.attackers;
  if (enemies.some((e) => isFriendly(ctx, ally, e) || findTreaty(ctx, 'nap', ally, e))) return false;
  const rel = relation(s, ally, caller);
  const c = s.countries[ally];
  const willing = rel + c.ai.aggression * 30 - c.warExhaustion - (warsOf(ctx, ally).length ? 25 : 0);
  if (willing >= 10) {
    joinWar(ctx, war, ally, side);
    return true;
  }
  addRelation(s, ally, caller, -15);
  notify(ctx, 'diplomacy', 'notif.callDeclined', { ally: c.name, country: s.countries[caller].name }, { severity: 'bad', involves: [caller] });
  return false;
}

export function joinWar(ctx: Ctx, war: War, tag: Tag, side: 'attackers' | 'defenders'): void {
  const s = ctx.s;
  if (war.attackers.includes(tag) || war.defenders.includes(tag)) return;
  war[side].push(tag);
  const enemies = side === 'attackers' ? war.defenders : war.attackers;
  // Ortak antlaşmaları boz
  removeTreaties(ctx, (t) => (t.type === 'trade' || t.type === 'access' || t.type === 'nap') && ((t.a === tag && enemies.includes(t.b)) || (t.b === tag && enemies.includes(t.a))));
  for (const e of enemies) setRelation(s, tag, e, Math.min(relation(s, tag, e), -50));
  invalidateDiplomacy(ctx);
  notify(ctx, 'war', 'notif.joinedWar', { country: s.countries[tag]?.name ?? tag, war: war.name }, { involves: [tag, ...enemies, ...war[side]], global: false, focus: { war: war.id } });
}

// ---------------------------------------------------------------------------
// Savaş skoru
// ---------------------------------------------------------------------------
export interface SideValues {
  total: number;
  occupied: number;
}

export function sideValues(ctx: Ctx, war: War, side: 'attackers' | 'defenders'): SideValues {
  const s = ctx.s;
  const members = new Set(war[side]);
  const enemies = new Set(side === 'attackers' ? war.defenders : war.attackers);
  let total = 0;
  let occupied = 0;
  for (const tag of members) {
    for (const p of provincesOf(ctx, tag)) {
      const v = provinceValue(ctx, p);
      total += v;
      const ctrl = s.provinces[p].controller;
      if (enemies.has(ctrl) || (ctrl === REBEL_TAG && enemies.has(REBEL_TAG))) occupied += v;
    }
  }
  return { total, occupied };
}

export function computeWarScore(ctx: Ctx, war: War): number {
  const att = sideValues(ctx, war, 'attackers');
  const def = sideValues(ctx, war, 'defenders');
  const occ = (def.total > 0 ? def.occupied / def.total : 0) - (att.total > 0 ? att.occupied / att.total : 0);
  let score = occ * 80 + war.battleScore * 0.6;
  // Lider tamamen işgal edildiyse teslimiyet
  const leaderOcc = (tag: Tag) => {
    const provs = provincesOf(ctx, tag);
    if (!provs.length) return 1;
    let c = 0;
    for (const p of provs) if (ctx.s.provinces[p].controller !== tag) c++;
    return c / provs.length;
  };
  if (leaderOcc(war.defenderLeader) >= 0.999 && def.total > 0) score = Math.max(score, 100);
  if (leaderOcc(war.attackerLeader) >= 0.999 && att.total > 0 && war.goal.type !== 'independence' && war.goal.type !== 'rebellion') score = Math.min(score, -100);
  war.score = Math.max(-100, Math.min(100, score));
  return war.score;
}

/** Bir tarafın lehine skor */
export function scoreFor(war: War, tag: Tag): number {
  const side = warSide(war, tag);
  return side === 'attackers' ? war.score : side === 'defenders' ? -war.score : 0;
}

// ---------------------------------------------------------------------------
// Barış
// ---------------------------------------------------------------------------
function loserTotalValue(ctx: Ctx, loser: Tag): number {
  let v = 0;
  for (const p of provincesOf(ctx, loser)) v += provinceValue(ctx, p);
  return Math.max(1, v);
}

export function termCost(ctx: Ctx, war: War, beneficiary: Tag, loser: Tag, term: PeaceTerm): number {
  const s = ctx.s;
  const total = loserTotalValue(ctx, loser);
  switch (term.type) {
    case 'province': {
      const v = provinceValue(ctx, term.province);
      const disc = hasClaimOrCore(ctx, beneficiary, term.province) ? 0.6 : 1;
      return (v / total) * 100 * disc;
    }
    case 'annex':
      return 100;
    case 'vassalize':
      return 60;
    case 'reparations': {
      const inc = Math.max(1, (s.countries[loser]?.budget.income ?? 1) * 12);
      return Math.min(100, ((term.amount * term.months) / inc) * 50);
    }
    case 'release': {
      let v = 0;
      for (const p of provincesOf(ctx, loser)) if (s.provinces[p].cores.includes(term.nation)) v += provinceValue(ctx, p);
      return (v / total) * 100 * 0.6;
    }
  }
}

export function termsCost(ctx: Ctx, war: War, beneficiary: Tag, loser: Tag, terms: PeaceTerm[]): number {
  if (terms.some((t) => t.type === 'annex')) return 100;
  return terms.reduce((sum, t) => sum + termCost(ctx, war, beneficiary, loser, t), 0);
}

/** Şart geçerli mi */
export function validTerm(ctx: Ctx, war: War, beneficiary: Tag, loser: Tag, term: PeaceTerm): boolean {
  const s = ctx.s;
  if (term.type === 'province') {
    const ps = s.provinces[term.province];
    if (!ps || ps.owner !== loser) return false;
    const c = s.countries[loser];
    if (c && c.capital === term.province && provincesOf(ctx, loser).length > 1) {
      // Başkent ancak işgal edilmişse alınabilir
      return enemiesIn(war, loser).includes(ps.controller);
    }
    return enemiesIn(war, loser).includes(ps.controller) || hasClaimOrCore(ctx, beneficiary, term.province);
  }
  if (term.type === 'vassalize') return provincesOf(ctx, loser).length <= provincesOf(ctx, beneficiary).length * 1.5 + 2;
  if (term.type === 'release') return term.nation !== beneficiary && term.nation !== loser && provincesOf(ctx, loser).some((p) => s.provinces[p].cores.includes(term.nation));
  if (term.type === 'reparations') return term.amount > 0 && term.months > 0 && term.months <= 120;
  return true;
}

export interface PeaceEvaluation {
  accept: boolean;
  /** kabul eşiği (kaybeden için) */
  willingness: number;
  cost: number;
  counter: PeaceTerm[] | null;
  reasonKey: string;
}

/** Yapay zekâ kaybeden tarafın kabul isteği */
export function loserWillingness(ctx: Ctx, war: War, loser: Tag, beneficiary: Tag): number {
  const s = ctx.s;
  const c = s.countries[loser];
  const score = scoreFor(war, beneficiary);
  const months = monthsCrossed(war.startDay, s.day);
  let w = score + (c?.warExhaustion ?? 0) * 0.3 + Math.min(15, months * 0.5);
  // Tamamen işgal edilen ülke her şeyi kabul eder
  const provs = provincesOf(ctx, loser);
  const occ = provs.length ? provs.filter((p) => s.provinces[p].controller !== loser).length / provs.length : 1;
  if (occ >= 0.999) w = Math.max(w, 100);
  if (c && !c.isPlayer && s.rules.difficulty === 'hard') w -= 5;
  if (c && !c.isPlayer && s.rules.difficulty === 'easy') w += 5;
  return w;
}

/**
 * Yapay zekânın bir barış teklifine yanıtı. offer.beneficiary şartlardan yararlanan taraf.
 * recipient: teklifi değerlendiren yapay zekâ.
 */
export function evaluatePeace(ctx: Ctx, war: War, proposer: Tag, recipient: Tag, beneficiary: Tag, terms: PeaceTerm[]): PeaceEvaluation {
  const loser = beneficiary === proposer ? recipient : proposer;
  const valid = terms.filter((t) => validTerm(ctx, war, beneficiary, loser, t));
  if (valid.length !== terms.length) return { accept: false, willingness: 0, cost: 0, counter: valid, reasonKey: 'peace.invalidTerms' };
  const cost = termsCost(ctx, war, beneficiary, loser, terms);
  if (beneficiary === proposer) {
    // Alıcı kaybeden taraftır
    const will = loserWillingness(ctx, war, recipient, proposer);
    if (cost <= Math.max(0, will) + 0.01 && (terms.length > 0 || will >= -5)) return { accept: true, willingness: will, cost, counter: null, reasonKey: 'peace.accepted' };
    // Karşı teklif: sırayla sığan şartlar
    const counter: PeaceTerm[] = [];
    let acc = 0;
    for (const t of terms) {
      if (t.type === 'annex') continue;
      const c = termCost(ctx, war, beneficiary, loser, t);
      if (acc + c <= will) {
        counter.push(t);
        acc += c;
      }
    }
    return { accept: false, willingness: will, cost, counter: counter.length && counter.length < terms.length ? counter : null, reasonKey: will < 0 ? 'peace.winningRefuse' : 'peace.tooMuch' };
  }
  // Teklif eden kaybediyor ve alıcıya (yapay zekâ) taviz veriyor
  const aiScore = scoreFor(war, recipient);
  const c = ctx.s.countries[recipient];
  const need = aiScore * 0.7 - (c?.warExhaustion ?? 0) * 0.3 - 5;
  if (cost >= need) return { accept: true, willingness: need, cost, counter: null, reasonKey: 'peace.accepted' };
  return { accept: false, willingness: need, cost, counter: null, reasonKey: 'peace.wantMore' };
}

export function transferProvince(ctx: Ctx, p: number, to: Tag): void {
  const s = ctx.s;
  const ps = s.provinces[p];
  const from = ps.owner;
  if (from === to) return;
  ps.owner = to;
  ps.controller = to;
  ps.siege = null;
  ps.construction = null;
  ps.recruits = [];
  ps.changedDay = s.day;
  if (!ps.cores.includes(to)) ps.unrest = Math.min(100, ps.unrest + 20);
  const fc = s.countries[from];
  if (fc) fc.claims = fc.claims.filter((x) => x !== p);
  const tc = s.countries[to];
  if (tc) tc.claims = tc.claims.filter((x) => x !== p);
  invalidateOwnership(ctx);
  if (fc && fc.capital === p) relocateCapital(ctx, from);
  if (tc && (tc.capital < 0 || s.provinces[tc.capital]?.owner !== to)) tc.capital = p;
}

export function releaseNation(ctx: Ctx, nation: Tag, from: Tag): number {
  const s = ctx.s;
  const n = s.countries[nation];
  if (!n) return 0;
  let count = 0;
  for (const p of [...provincesOf(ctx, from)]) {
    if (s.provinces[p].cores.includes(nation)) {
      transferProvince(ctx, p, nation);
      count++;
    }
  }
  if (count) {
    reviveCountry(ctx, nation);
    setRelation(s, nation, from, -30);
  }
  return count;
}

export function reviveCountry(ctx: Ctx, tag: Tag): void {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c) return;
  const provs = provincesOf(ctx, tag);
  if (!provs.length) return;
  const wasDead = !c.alive || c.rebelMovement;
  c.alive = true;
  c.rebelMovement = false;
  let best = provs[0];
  for (const p of provs) if (s.provinces[p].pop > s.provinces[best].pop) best = p;
  if (c.capital < 0 || s.provinces[c.capital]?.owner !== tag) c.capital = best;
  if (wasDead) {
    c.stability = Math.max(c.stability, 50);
    c.warExhaustion = 0;
    c.treasury = Math.max(c.treasury, 0);
    notify(ctx, 'province', 'notif.countryFormed', { country: c.name }, { severity: 'info', global: true, involves: [tag], focus: { country: tag } });
  }
}

/** Barışı uygula. separate=true: yalnızca beneficiary ile loser arasında ayrı barış. */
export function applyPeace(ctx: Ctx, war: War, beneficiary: Tag, loser: Tag, terms: PeaceTerm[], separate: boolean): void {
  const s = ctx.s;
  const bc = s.countries[beneficiary];
  for (const t of terms) {
    if (!validTerm(ctx, war, beneficiary, loser, t)) continue;
    switch (t.type) {
      case 'province':
        transferProvince(ctx, t.province, beneficiary);
        break;
      case 'annex':
        for (const p of [...provincesOf(ctx, loser)]) transferProvince(ctx, p, beneficiary);
        break;
      case 'vassalize':
        leaveAlliance(ctx, loser);
        removeTreaties(ctx, (x) => x.type === 'vassal' && x.b === loser);
        addTreaty(ctx, { type: 'vassal', a: beneficiary, b: loser, start: s.day, end: null });
        break;
      case 'reparations':
        addTreaty(ctx, { type: 'reparations', a: loser, b: beneficiary, start: s.day, end: s.day + Math.round(t.months * 30.44), amount: t.amount });
        break;
      case 'release':
        releaseNation(ctx, t.nation, loser);
        break;
    }
  }
  const winnerSide = warSide(war, beneficiary)!;
  const loserSide = winnerSide === 'attackers' ? 'defenders' : 'attackers';
  const leaving = separate ? [loser] : war[loserSide];
  const opposing = separate ? [beneficiary, ...war[winnerSide].filter((x) => x !== beneficiary)] : war[winnerSide];

  // Ateşkes ve kontrol iadesi
  const pairs: [Tag, Tag][] = [];
  for (const a of leaving) for (const b of opposing) pairs.push([a, b]);
  for (const [a, b] of pairs) {
    if (a === REBEL_TAG || b === REBEL_TAG) continue;
    if (!findTreaty(ctx, 'truce', a, b)) addTreaty(ctx, { type: 'truce', a, b, start: s.day, end: s.day + Math.round(BAL.truceYears * 365.25) });
    addRelation(s, a, b, 15);
  }
  if (separate) {
    war[loserSide] = war[loserSide].filter((x) => x !== loser);
    restoreControl(ctx, [loser], war[winnerSide]);
    restoreControl(ctx, war[winnerSide], [loser]);
  } else {
    restoreControl(ctx, war.attackers, war.defenders);
    restoreControl(ctx, war.defenders, war.attackers);
  }
  if (!separate || !war[loserSide].length) endWar(ctx, war);
  invalidateDiplomacy(ctx);
  expelForeignArmies(ctx);

  const termsDesc = terms.length ? terms.length : 0;
  notify(
    ctx,
    'peace',
    terms.length ? 'notif.peaceSigned' : 'notif.whitePeace',
    { winner: bc?.name ?? beneficiary, loser: s.countries[loser]?.name ?? loser, war: war.name, terms: termsDesc },
    { severity: beneficiary === s.player ? 'good' : loser === s.player ? 'bad' : 'info', involves: [beneficiary, loser, ...leaving, ...opposing], global: true, focus: { war: war.id } },
  );
  checkEliminations(ctx);
}

/** a tarafındaki ülkelerin sahip olduğu ve b tarafınca kontrol edilen bölgeleri sahibine iade et */
function restoreControl(ctx: Ctx, owners: Tag[], occupiers: Tag[]): void {
  const s = ctx.s;
  const occ = new Set(occupiers);
  let changed = false;
  for (const tag of owners) {
    for (const p of provincesOf(ctx, tag)) {
      const ps = s.provinces[p];
      if (ps.controller !== tag && (occ.has(ps.controller) || ps.controller === REBEL_TAG)) {
        ps.controller = tag;
        ps.siege = null;
        changed = true;
      }
    }
  }
  if (changed) invalidateOwnership(ctx);
}

export function endWar(ctx: Ctx, war: War): void {
  delete ctx.s.wars[war.id];
  ctx.s.peaceOffers = ctx.s.peaceOffers.filter((o) => o.warId !== war.id);
  ctx.s.proposals = ctx.s.proposals.filter((p) => p.warId !== war.id);
  invalidateDiplomacy(ctx);
}

/** Barıştan sonra yabancı topraklarda geçiş hakkı olmayan orduları en yakın dost bölgeye taşı */
export function expelForeignArmies(ctx: Ctx): void {
  const { s, w } = ctx;
  let moved = false;
  for (const a of Object.values(s.armies)) {
    if (a.location >= w.P) continue;
    const ps = s.provinces[a.location];
    if (a.isNavy) {
      if (ps.controller !== a.owner && !isFriendly(ctx, a.owner, ps.controller) && !findTreaty(ctx, 'access', ps.controller, a.owner)) {
        const sea = w.data.provinces[a.location].sea[0];
        if (sea !== undefined) {
          a.location = w.P + sea;
          a.path = [];
          moved = true;
        }
      }
      continue;
    }
    if (ps.controller === a.owner) continue;
    if (atWar(ctx, a.owner, ps.controller) || atWar(ctx, a.owner, ps.owner)) continue;
    if (isFriendly(ctx, a.owner, ps.controller) || findTreaty(ctx, 'access', ps.controller, a.owner)) continue;
    const home = nearestFriendlyProvince(ctx, a.owner, a.location, false);
    const cap = s.countries[a.owner]?.capital ?? -1;
    const dest = home >= 0 ? home : cap;
    if (dest >= 0) {
      a.location = dest;
      a.path = [];
      a.progress = 0;
      moved = true;
    } else {
      delete s.armies[a.id];
      moved = true;
    }
  }
  if (moved) invalidateArmies(ctx);
}

export function leaveAlliance(ctx: Ctx, tag: Tag): void {
  const s = ctx.s;
  const al = allianceOf(ctx, tag);
  if (!al) return;
  al.members = al.members.filter((m) => m !== tag);
  if (al.members.length < 2) delete s.alliances[al.id];
  else if (al.leader === tag) {
    // En güçlü üye lider olur
    let best = al.members[0];
    for (const m of al.members) if (provincesOf(ctx, m).length > provincesOf(ctx, best).length) best = m;
    al.leader = best;
  }
  invalidateDiplomacy(ctx);
}

/** Toprağı kalmayan ülkeleri ortadan kaldır */
export function checkEliminations(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.rebelMovement || c.tag === REBEL_TAG) continue;
    if (provincesOf(ctx, c.tag).length === 0) eliminateCountry(ctx, c.tag);
  }
}

export function eliminateCountry(ctx: Ctx, tag: Tag): void {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c) return;
  c.alive = false;
  c.capital = -1;
  c.treasury = 0;
  c.manpower = 0;
  // Savaşlardan çıkar
  for (const w of Object.values(s.wars)) {
    const side = warSide(w, tag);
    if (!side) continue;
    w[side] = w[side].filter((x) => x !== tag);
    if (!w[side].length) {
      endWar(ctx, w);
      continue;
    }
    if (w.attackerLeader === tag) w.attackerLeader = w.attackers[0];
    if (w.defenderLeader === tag) w.defenderLeader = w.defenders[0];
  }
  removeTreaties(ctx, (t) => t.a === tag || t.b === tag);
  leaveAlliance(ctx, tag);
  for (const a of armiesOf(ctx, tag)) delete s.armies[a.id];
  s.proposals = s.proposals.filter((p) => p.from !== tag && p.to !== tag);
  s.peaceOffers = s.peaceOffers.filter((p) => p.from !== tag && p.to !== tag);
  s.pendingEvents = s.pendingEvents.filter((e) => e.country !== tag);
  invalidateArmies(ctx);
  invalidateDiplomacy(ctx);
  notify(ctx, 'province', 'notif.countryEliminated', { country: c.name }, { severity: tag === s.player ? 'critical' : 'info', global: true, involves: [tag] });
}

/** Savaş yorgunluğu, skor ve kendiliğinden sona eren savaşlar */
export function warTick(ctx: Ctx, dt: number, monthChanged: boolean): void {
  const s = ctx.s;
  for (const war of Object.values(s.wars)) {
    computeWarScore(ctx, war);
  }
  if (!monthChanged) return;
  const atWarSet = new Set<Tag>();
  for (const war of Object.values(s.wars)) for (const t of [...war.attackers, ...war.defenders]) atWarSet.add(t);
  for (const c of Object.values(s.countries)) {
    if (!c.alive) continue;
    if (atWarSet.has(c.tag)) {
      // işgal edilen bölge oranı yorgunluğu artırır
      const provs = provincesOf(ctx, c.tag);
      const occ = provs.length ? provs.filter((p) => s.provinces[p].controller !== c.tag).length / provs.length : 0;
      const mods = ctx.cache.mods.get(c.tag);
      const mult = Math.max(0.3, 1 + (mods?.warExhaustion ?? 0));
      c.warExhaustion = Math.min(100, c.warExhaustion + (0.4 + occ * 4) * mult);
    } else {
      c.warExhaustion = Math.max(0, c.warExhaustion - 2.5);
    }
  }
  void dt;
}

/** Ateşkes ve antlaşma sürelerinin dolması */
export function treatyTick(ctx: Ctx): void {
  const s = ctx.s;
  const expired = s.treaties.filter((t) => t.end !== null && t.end <= s.day);
  if (!expired.length) return;
  removeTreaties(ctx, (t) => expired.includes(t));
  for (const t of expired) {
    if (t.type === 'nap' || t.type === 'defensive' || t.type === 'access') {
      notify(ctx, 'treaty', 'notif.treatyExpired', { type: t.type, a: s.countries[t.a]?.name ?? t.a, b: s.countries[t.b]?.name ?? t.b }, { involves: [t.a, t.b] });
    }
  }
}

export function warDurationYears(ctx: Ctx, war: War): number {
  return yearsBetween(war.startDay, ctx.s.day);
}
