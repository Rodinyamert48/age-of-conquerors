/**
 * Diplomasi: ilişki kaymaları, diplomatik eylemler ve yapay zekânın kabul değerlendirmesi.
 * Her eylem oyun durumunda gerçek bir değişiklik yaratır (antlaşma, ilişki, toprak, ittifak üyeliği).
 */
import type { Alliance, DiploActionType, Tag, Treaty } from './types';
import { allianceOf, findTreaty, getMods, invalidateDiplomacy, neighborCountries, provincesOf, warsOf, type Ctx } from './ctx';
import {
  addRelation,
  atWar,
  enemiesOf,
  isAtWar,
  overlordOf,
  relation,
  REBEL_TAG,
  sameAlliance,
  setRelation,
  strategicStrength,
  totalOutput,
  vassalsOf,
} from './query';
import { GOVERNMENT_DEFS } from './defs/policies';
import { BAL } from './balance';
import { notify, newId } from './notify';
import { canAfford, spend } from './economy';
import { joinWar, leaveAlliance, removeTreaties, transferProvince } from './war';
import { yearsBetween } from './calendar';
import { hashString } from './rng';

export interface Reason {
  key: string;
  value: number;
}

export interface Evaluation {
  score: number;
  accept: boolean;
  reasons: Reason[];
}

export const BILATERAL_ACTIONS: DiploActionType[] = ['nap', 'alliance', 'defensive', 'trade', 'access', 'normalize', 'vassalize', 'requestProvince'];

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function ideologyGroup(ctx: Ctx, tag: Tag): string {
  return GOVERNMENT_DEFS[ctx.s.countries[tag]?.government ?? 'republic']?.group ?? 'democratic';
}

export function ideologyAffinity(ctx: Ctx, a: Tag, b: Tag): number {
  const ga = ideologyGroup(ctx, a);
  const gb = ideologyGroup(ctx, b);
  if (ga === gb) return 10;
  const pair = [ga, gb].sort().join('|');
  if (pair.includes('fascist') && (pair.includes('democratic') || pair.includes('communist'))) return -25;
  if (pair === 'communist|democratic') return -15;
  return -8;
}

/** a'nın b'ye karşı hissettiği tehdit: b'nin gücü / a'nın gücü (komşuysa) */
export function threatRatio(ctx: Ctx, a: Tag, b: Tag): number {
  const pa = Math.max(1, strategicStrength(ctx, a));
  const pb = strategicStrength(ctx, b);
  return pb / pa;
}

/** b'ye karşı kendi müttefikleriyle birlikte savunma gücü */
export function coalitionStrength(ctx: Ctx, tag: Tag): number {
  let p = strategicStrength(ctx, tag);
  const al = allianceOf(ctx, tag);
  if (al) for (const m of al.members) if (m !== tag) p += strategicStrength(ctx, m) * 0.6;
  for (const t of ctx.s.treaties) {
    if (t.type !== 'defensive') continue;
    const other = t.a === tag ? t.b : t.b === tag ? t.a : null;
    if (other && !al?.members.includes(other)) p += strategicStrength(ctx, other) * 0.5;
  }
  const ov = overlordOf(ctx, tag);
  if (ov) p += strategicStrength(ctx, ov) * 0.7;
  return p;
}

/** Saldırı savaşında beklenen güç: kendi gücü + bağlılar + ittifak üyelerinin bir kısmı (savunma paktları sayılmaz) */
export function offensiveStrength(ctx: Ctx, tag: Tag): number {
  let p = strategicStrength(ctx, tag);
  for (const v of vassalsOf(ctx, tag)) p += strategicStrength(ctx, v) * 0.8;
  const al = allianceOf(ctx, tag);
  if (al) for (const m of al.members) if (m !== tag) p += strategicStrength(ctx, m) * 0.3;
  return p;
}

function commonEnemies(ctx: Ctx, a: Tag, b: Tag): number {
  const ea = enemiesOf(ctx, a);
  let n = 0;
  for (const e of enemiesOf(ctx, b)) if (ea.has(e)) n++;
  return n;
}

/** a'nın en büyük tehdidi (komşu ve güçlü) */
export function biggestThreat(ctx: Ctx, a: Tag): { tag: Tag; ratio: number } | null {
  let best: { tag: Tag; ratio: number } | null = null;
  for (const n of neighborCountries(ctx, a)) {
    if (n === REBEL_TAG || !ctx.s.countries[n]?.alive) continue;
    if (sameAlliance(ctx, a, n)) continue;
    const r = threatRatio(ctx, a, n) * (relation(ctx.s, a, n) < 0 ? 1.4 : 0.7);
    if (!best || r > best.ratio) best = { tag: n, ratio: r };
  }
  return best;
}

export function improveCost(ctx: Ctx, from: Tag): number {
  const c = ctx.s.countries[from];
  return Math.max(0.05, c.budget.income * 0.15);
}

export function slotsUsed(ctx: Ctx, tag: Tag): number {
  return ctx.s.treaties.filter((t) => (t.a === tag || t.b === tag) && (t.type === 'defensive' || t.type === 'nap')).length;
}

// ---------------------------------------------------------------------------
// Kabul değerlendirmesi
// ---------------------------------------------------------------------------
export function evaluateProposal(ctx: Ctx, from: Tag, to: Tag, type: DiploActionType, province?: number): Evaluation {
  const s = ctx.s;
  const reasons: Reason[] = [];
  const add = (key: string, value: number) => {
    if (Math.abs(value) >= 0.5) reasons.push({ key, value: Math.round(value) });
  };
  const fc = s.countries[from];
  const tc = s.countries[to];
  const rel = relation(s, from, to);
  const modsTo = getMods(ctx, to);
  const modsFrom = getMods(ctx, from);
  add('reason.reputation', fc.reputation * 0.3);
  add('reason.diplomaticTech', modsFrom.acceptance);
  if (tc.ai.rival === from) add('reason.rival', -40);
  if (tc.ai.warTarget === from) add('reason.planningWar', -100);
  const powerRatio = strategicStrength(ctx, from) / Math.max(1, strategicStrength(ctx, to));
  const threat = biggestThreat(ctx, to);
  const threatenedBy = threat && threat.tag !== from && threat.ratio > 1 ? Math.min(40, (threat.ratio - 1) * 20) : 0;

  switch (type) {
    case 'nap':
      add('reason.base', 0);
      add('reason.relations', rel * 0.5);
      add('reason.fear', powerRatio > 1.5 ? Math.min(25, (powerRatio - 1) * 10) : 0);
      add('reason.otherThreats', threatenedBy * 0.5);
      if (findTreaty(ctx, 'nap', from, to)) add('reason.alreadyHave', -1000);
      break;
    case 'alliance': {
      const fa = allianceOf(ctx, from);
      const ta = allianceOf(ctx, to);
      add('reason.base', -35);
      add('reason.relations', rel * 0.6);
      add('reason.ideology', ideologyAffinity(ctx, from, to));
      add('reason.commonEnemies', commonEnemies(ctx, from, to) * 20);
      add('reason.otherThreats', threatenedBy);
      add('reason.strength', Math.max(-20, Math.min(30, (powerRatio - 0.5) * 15)));
      if (isAtWar(ctx, from) && !commonEnemies(ctx, from, to)) add('reason.dangerousWars', -25);
      if (ta && ta !== fa) add('reason.otherAlliance', -1000);
      if (fa && ta && fa === ta) add('reason.alreadyHave', -1000);
      if (rel < -20) add('reason.distrust', -30);
      break;
    }
    case 'defensive':
      add('reason.base', -20);
      add('reason.relations', rel * 0.6);
      add('reason.ideology', ideologyAffinity(ctx, from, to) * 0.6);
      add('reason.otherThreats', threatenedBy);
      add('reason.strength', Math.max(-20, Math.min(25, (powerRatio - 0.5) * 12)));
      if (isAtWar(ctx, from)) add('reason.dangerousWars', -20);
      if (findTreaty(ctx, 'defensive', from, to)) add('reason.alreadyHave', -1000);
      if (slotsUsed(ctx, to) > 8) add('reason.tooManyTreaties', -20);
      break;
    case 'trade':
      add('reason.base', 10);
      add('reason.relations', rel * 0.4);
      if (isAtWar(ctx, from) && enemiesOf(ctx, from).has(to)) add('reason.atWar', -1000);
      if (findTreaty(ctx, 'trade', from, to)) add('reason.alreadyHave', -1000);
      add('reason.economy', Math.min(15, Math.log10(1 + totalOutput(ctx, from) / Math.max(1, totalOutput(ctx, to))) * 10));
      break;
    case 'access':
      add('reason.base', -10);
      add('reason.relations', rel * 0.5);
      if (sameAlliance(ctx, from, to)) add('reason.allied', 50);
      for (const e of enemiesOf(ctx, from)) if (relation(s, to, e) > 40) add('reason.friendsWithEnemy', -40);
      if (findTreaty(ctx, 'access', to, from)) add('reason.alreadyHave', -1000);
      break;
    case 'normalize':
      add('reason.base', 5);
      add('reason.relations', rel < -80 ? -25 : 0);
      if (atWar(ctx, from, to)) add('reason.atWar', -1000);
      add('reason.fear', powerRatio > 1.3 ? 15 : 0);
      add('reason.warWeary', tc.warExhaustion * 0.3);
      break;
    case 'vassalize':
      add('reason.base', -80);
      add('reason.relations', rel * 0.5);
      add('reason.fear', powerRatio > 4 ? Math.min(60, (powerRatio - 4) * 6 + 20) : -30);
      add('reason.size', -Math.max(0, provincesOf(ctx, to).length - 6) * 8);
      if (allianceOf(ctx, to)) add('reason.otherAlliance', -50);
      if (overlordOf(ctx, to)) add('reason.alreadyVassal', -1000);
      break;
    case 'requestProvince': {
      add('reason.base', -70);
      add('reason.relations', rel * 0.3);
      if (findTreaty(ctx, 'vassal', from, to)) add('reason.overlord', 60);
      if (province !== undefined && s.provinces[province]?.cores.includes(to)) add('reason.coreProvince', -40);
      if (province !== undefined && s.provinces[province]?.cores.includes(from)) add('reason.yourCore', 20);
      add('reason.fear', powerRatio > 3 ? Math.min(30, (powerRatio - 3) * 5) : 0);
      break;
    }
    default:
      break;
  }
  void modsTo;
  // Zorluk: yapay zekâ oyuncuya karşı daha seçici
  if (from === s.player && !tc.isPlayer) {
    if (s.rules.difficulty === 'hard') add('reason.difficulty', -10);
    if (s.rules.difficulty === 'easy') add('reason.difficulty', 8);
  }
  const score = reasons.reduce((sum, r) => sum + r.value, 0);
  return { score, accept: score >= 0, reasons };
}

// ---------------------------------------------------------------------------
// Eylemler
// ---------------------------------------------------------------------------
export interface ActionResult {
  ok: boolean;
  error?: string;
  accepted?: boolean;
  evaluation?: Evaluation;
}

export function addTreatyIfMissing(ctx: Ctx, type: Treaty['type'], a: Tag, b: Tag, years: number | null): Treaty {
  const existing = findTreaty(ctx, type, a, b);
  if (existing) return existing;
  const t: Treaty = { id: newId(ctx, 't'), type, a, b, start: ctx.s.day, end: years ? ctx.s.day + Math.round(years * 365.25) : null };
  ctx.s.treaties.push(t);
  invalidateDiplomacy(ctx);
  return t;
}

function createOrJoinAlliance(ctx: Ctx, leaderTag: Tag, member: Tag): Alliance {
  const s = ctx.s;
  const existing = allianceOf(ctx, leaderTag);
  if (existing) {
    if (!existing.members.includes(member)) existing.members.push(member);
    invalidateDiplomacy(ctx);
    return existing;
  }
  const other = allianceOf(ctx, member);
  if (other) {
    if (!other.members.includes(leaderTag)) other.members.push(leaderTag);
    invalidateDiplomacy(ctx);
    return other;
  }
  const al: Alliance = {
    id: newId(ctx, 'a'),
    name: `${s.countries[leaderTag]?.name ?? leaderTag}–${s.countries[member]?.name ?? member}`,
    leader: leaderTag,
    members: [leaderTag, member],
    founded: s.day,
  };
  s.alliances[al.id] = al;
  invalidateDiplomacy(ctx);
  return al;
}

/** Ortak ön koşullar */
function precheck(ctx: Ctx, from: Tag, to: Tag, type: DiploActionType): string | null {
  const s = ctx.s;
  const fc = s.countries[from];
  const tc = s.countries[to];
  if (!fc?.alive || !tc?.alive || from === to || to === REBEL_TAG) return 'err.invalidTarget';
  if (tc.rebelMovement && type !== 'recognize') return 'err.invalidTarget';
  const war = atWar(ctx, from, to);
  const needsPeace: DiploActionType[] = ['nap', 'alliance', 'defensive', 'trade', 'access', 'normalize', 'vassalize', 'improve', 'requestProvince', 'cedeProvince'];
  if (war && needsPeace.includes(type)) return 'err.atWarWith';
  if (overlordOf(ctx, from) && (type === 'alliance' || type === 'vassalize')) return 'err.vassalCannotDeclare';
  return null;
}

/**
 * Bir diplomatik eylemi uygular. İki taraflı eylemlerde hedef yapay zekâysa kabul değerlendirilir;
 * hedef oyuncuysa teklif kuyruğa eklenir.
 */
export function performAction(ctx: Ctx, from: Tag, to: Tag, type: DiploActionType, province?: number): ActionResult {
  const s = ctx.s;
  const err = precheck(ctx, from, to, type);
  if (err) return { ok: false, error: err };
  const fc = s.countries[from];
  const tc = s.countries[to];
  const mods = getMods(ctx, from);

  switch (type) {
    case 'improve': {
      const key = `improve|${to}`;
      if ((fc.ai.cooldowns[key] ?? -Infinity) > s.day) return { ok: false, error: 'err.cooldown' };
      const cost = improveCost(ctx, from);
      if (!canAfford(ctx, from, cost)) return { ok: false, error: 'err.noMoney' };
      spend(ctx, from, cost, 'diplomacy');
      const rel = relation(s, from, to);
      const gain = 15 * Math.max(0.2, 1 + mods.relationGain) * (rel > 50 ? 0.5 : 1);
      addRelation(s, from, to, gain);
      fc.ai.cooldowns[key] = s.day + 60;
      return { ok: true, accepted: true };
    }
    case 'worsen': {
      addRelation(s, from, to, -25);
      if (tc.ai.rival === null && !tc.isPlayer) tc.ai.rival = from;
      notify(ctx, 'diplomacy', 'notif.insulted', { from: fc.name, to: tc.name }, { severity: 'bad', involves: [to, from] });
      return { ok: true, accepted: true };
    }
    case 'claim': {
      if (province === undefined) return { ok: false, error: 'err.invalidTarget' };
      const ps = s.provinces[province];
      if (!ps || ps.owner !== to) return { ok: false, error: 'err.invalidTarget' };
      if (fc.claims.includes(province)) return { ok: false, error: 'err.alreadyHave' };
      // Yalnızca komşu ya da kıyısı karşılıklı bölgelere talep
      const adjacent = ctx.w.data.provinces[province].adj.concat(ctx.w.data.provinces[province].cross).some((j) => s.provinces[j].owner === from);
      if (!adjacent) return { ok: false, error: 'err.notAdjacent' };
      fc.claims.push(province);
      fc.reputation = Math.max(-100, fc.reputation - 3);
      addRelation(s, from, to, -15);
      notify(ctx, 'diplomacy', 'notif.claimMade', { from: fc.name, province: ctx.w.data.provinces[province].name }, { severity: 'bad', involves: [to] });
      return { ok: true, accepted: true };
    }
    case 'recognize': {
      if (tc.recognizedBy.includes(from)) return { ok: false, error: 'err.alreadyHave' };
      tc.recognizedBy.push(from);
      addRelation(s, from, to, 30);
      // Ana devlet tepkisi
      for (const w of warsOf(ctx, to)) if (w.goal.type === 'independence') for (const d of w.defenders) addRelation(s, from, d, -20);
      return { ok: true, accepted: true };
    }
    case 'cedeProvince': {
      if (province === undefined) return { ok: false, error: 'err.invalidTarget' };
      const ps = s.provinces[province];
      if (!ps || ps.owner !== from || ps.controller !== from) return { ok: false, error: 'err.invalidTarget' };
      if (fc.capital === province) return { ok: false, error: 'err.cannotCedeCapital' };
      if (provincesOf(ctx, from).length <= 1) return { ok: false, error: 'err.cannotCedeCapital' };
      transferProvince(ctx, province, to);
      addRelation(s, from, to, 25);
      notify(ctx, 'province', 'notif.provinceCeded', { from: fc.name, to: tc.name, province: ctx.w.data.provinces[province].name }, { involves: [from, to], focus: { province } });
      return { ok: true, accepted: true };
    }
    case 'breakTreaty': {
      // province parametresi burada antlaşma türü yerine kullanılmaz; tüm (nap/defensive/trade/access) kaldırılır
      const removed = removeTreaties(ctx, (t) => (t.a === from && t.b === to) || (t.b === from && t.a === to) ? t.type !== 'truce' && t.type !== 'vassal' && t.type !== 'reparations' : false);
      if (!removed.length) return { ok: false, error: 'err.noTreaty' };
      for (const t of removed) {
        if (t.type === 'nap') fc.reputation = Math.max(-100, fc.reputation - 10);
        addRelation(s, from, to, t.type === 'nap' || t.type === 'defensive' ? -30 : -10);
      }
      notify(ctx, 'treaty', 'notif.treatyBroken', { from: fc.name, to: tc.name }, { severity: 'bad', involves: [to, from] });
      return { ok: true, accepted: true };
    }
    case 'leaveAlliance': {
      const al = allianceOf(ctx, from);
      if (!al) return { ok: false, error: 'err.noAlliance' };
      const allyWars = warsOf(ctx, from).some((w) => al.members.some((m) => m !== from && (w.attackers.includes(m) || w.defenders.includes(m))));
      if (allyWars) return { ok: false, error: 'err.alliesAtWar' };
      leaveAlliance(ctx, from);
      fc.reputation = Math.max(-100, fc.reputation - 5);
      for (const m of al.members) addRelation(s, from, m, -20);
      return { ok: true, accepted: true };
    }
    case 'releaseVassal': {
      const t = findTreaty(ctx, 'vassal', from, to);
      if (!t) return { ok: false, error: 'err.noTreaty' };
      removeTreaties(ctx, (x) => x === t);
      addRelation(s, from, to, 40);
      return { ok: true, accepted: true };
    }
    case 'annexVassal': {
      const t = findTreaty(ctx, 'vassal', from, to);
      if (!t) return { ok: false, error: 'err.noTreaty' };
      if (yearsBetween(t.start, s.day) < 3) return { ok: false, error: 'err.tooSoon' };
      if (relation(s, from, to) < 40) return { ok: false, error: 'err.relationsTooLow' };
      const cost = provincesOf(ctx, to).reduce((sum, p) => sum + s.provinces[p].output, 0) * 0.05;
      if (!canAfford(ctx, from, cost)) return { ok: false, error: 'err.noMoney' };
      spend(ctx, from, cost, 'diplomacy');
      for (const p of [...provincesOf(ctx, to)]) transferProvince(ctx, p, from);
      return { ok: true, accepted: true };
    }
    default:
      break;
  }

  // İki taraflı teklifler
  if (!BILATERAL_ACTIONS.includes(type)) return { ok: false, error: 'err.invalidAction' };
  if (type === 'requestProvince') {
    if (province === undefined || s.provinces[province]?.owner !== to) return { ok: false, error: 'err.invalidTarget' };
    if (s.countries[to].capital === province) return { ok: false, error: 'err.cannotCedeCapital' };
  }
  if (type === 'vassalize' && (overlordOf(ctx, to) || vassalsOf(ctx, to).length > 0 && provincesOf(ctx, to).length > provincesOf(ctx, from).length)) {
    return { ok: false, error: 'err.invalidTarget' };
  }
  if (tc.isPlayer) {
    // Oyuncuya teklif
    if (s.proposals.some((p) => p.from === from && p.to === to && p.type === type)) return { ok: false, error: 'err.pending' };
    s.proposals.push({ id: newId(ctx, 'p'), from, to, type, province, day: s.day, expires: s.day + 30 });
    notify(ctx, 'diplomacy', 'notif.proposalReceived', { from: fc.name, type }, { severity: 'info', involves: [to], focus: { country: from } });
    return { ok: true, accepted: undefined };
  }
  const ev = evaluateProposal(ctx, from, to, type, province);
  if (!ev.accept) {
    // Yinelenen reddedilen teklifler için bekleme süresi
    fc.ai.cooldowns[`${type}|${to}`] = s.day + 90;
    return { ok: true, accepted: false, evaluation: ev };
  }
  applyBilateral(ctx, from, to, type, province);
  return { ok: true, accepted: true, evaluation: ev };
}

export function applyBilateral(ctx: Ctx, from: Tag, to: Tag, type: DiploActionType, province?: number): void {
  const s = ctx.s;
  const fc = s.countries[from];
  const tc = s.countries[to];
  switch (type) {
    case 'nap':
      addTreatyIfMissing(ctx, 'nap', from, to, BAL.napYears);
      addRelation(s, from, to, 10);
      break;
    case 'alliance':
      createOrJoinAlliance(ctx, from, to);
      addRelation(s, from, to, 20);
      break;
    case 'defensive':
      addTreatyIfMissing(ctx, 'defensive', from, to, null);
      addRelation(s, from, to, 15);
      break;
    case 'trade':
      addTreatyIfMissing(ctx, 'trade', from, to, null);
      addRelation(s, from, to, 8);
      break;
    case 'access':
      addTreatyIfMissing(ctx, 'access', to, from, null);
      addRelation(s, from, to, 5);
      break;
    case 'normalize':
      setRelation(s, from, to, Math.max(relation(s, from, to), 0));
      if (fc.ai.rival === to) fc.ai.rival = null;
      if (tc.ai.rival === from) tc.ai.rival = null;
      break;
    case 'vassalize':
      leaveAlliance(ctx, to);
      addTreatyIfMissing(ctx, 'vassal', from, to, null);
      break;
    case 'requestProvince':
      if (province !== undefined) transferProvince(ctx, province, from);
      break;
    default:
      break;
  }
  invalidateDiplomacy(ctx);
  notify(
    ctx,
    'treaty',
    'notif.treatySigned',
    { type, a: fc.name, b: tc.name },
    { severity: 'good', involves: [from, to], global: type === 'alliance' || type === 'vassalize', focus: { country: to } },
  );
}

/** Oyuncunun kendisine gelen teklife yanıtı */
export function answerProposal(ctx: Ctx, proposalId: string, accept: boolean): ActionResult {
  const s = ctx.s;
  const p = s.proposals.find((x) => x.id === proposalId);
  if (!p) return { ok: false, error: 'err.notFound' };
  s.proposals = s.proposals.filter((x) => x !== p);
  if (!s.countries[p.from]?.alive) return { ok: false, error: 'err.invalidTarget' };
  if (p.type === 'callToArms') {
    const war = p.warId ? s.wars[p.warId] : undefined;
    if (!war) return { ok: false, error: 'err.notFound' };
    if (accept) {
      const side = war.attackers.includes(p.from) ? 'attackers' : 'defenders';
      joinWar(ctx, war, p.to, side);
    } else {
      addRelation(s, p.from, p.to, -20);
    }
    return { ok: true, accepted: accept };
  }
  if (accept) {
    if (atWar(ctx, p.from, p.to)) return { ok: false, error: 'err.atWarWith' };
    applyBilateral(ctx, p.from, p.to, p.type, p.province);
  } else {
    addRelation(s, p.from, p.to, -5);
  }
  return { ok: true, accepted: accept };
}

// ---------------------------------------------------------------------------
// Aylık ilişki kayması
// ---------------------------------------------------------------------------
export function relationTick(ctx: Ctx): void {
  const s = ctx.s;
  const pairs = new Set<string>();
  const tags = Object.values(s.countries).filter((c) => c.alive && c.tag !== REBEL_TAG).map((c) => c.tag);
  const addPair = (a: Tag, b: Tag) => {
    if (a === b) return;
    pairs.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  };
  for (const k of Object.keys(s.relations)) pairs.add(k);
  for (const t of tags) for (const n of neighborCountries(ctx, t)) if (n !== REBEL_TAG) addPair(t, n);
  for (const t of s.treaties) addPair(t.a, t.b);
  for (const pk of pairs) {
    const [a, b] = pk.split('|');
    const ca = s.countries[a];
    const cb = s.countries[b];
    if (!ca?.alive || !cb?.alive) {
      delete s.relations[pk];
      continue;
    }
    const target = baselineRelation(ctx, a, b);
    const cur = relation(s, a, b);
    setRelation(s, a, b, cur + (target - cur) * 0.04);
  }
  // İtibar yavaşça toparlanır
  for (const t of tags) {
    const c = s.countries[t];
    if (c.reputation < 0) c.reputation = Math.min(0, c.reputation + 0.5);
    else if (c.reputation > 0) c.reputation = Math.max(0, c.reputation - 0.1);
  }
}

export function baselineRelation(ctx: Ctx, a: Tag, b: Tag): number {
  const s = ctx.s;
  let v = 0;
  if (atWar(ctx, a, b)) return -100;
  v += ideologyAffinity(ctx, a, b);
  if (sameAlliance(ctx, a, b)) v += 40;
  if (findTreaty(ctx, 'trade', a, b)) v += 10;
  if (findTreaty(ctx, 'defensive', a, b)) v += 15;
  if (findTreaty(ctx, 'nap', a, b)) v += 5;
  if (findTreaty(ctx, 'vassal', a, b) || findTreaty(ctx, 'vassal', b, a)) v += 35;
  if (findTreaty(ctx, 'truce', a, b)) v -= 20;
  // Sınır anlaşmazlıkları: karşı tarafın elindeki çekirdek bölgeler ve talepler
  let disputes = 0;
  for (const p of provincesOf(ctx, b)) {
    const ps = s.provinces[p];
    if (ps.cores.includes(a)) disputes++;
    if (s.countries[a].claims.includes(p)) disputes++;
  }
  for (const p of provincesOf(ctx, a)) {
    const ps = s.provinces[p];
    if (ps.cores.includes(b)) disputes++;
    if (s.countries[b].claims.includes(p)) disputes++;
  }
  v -= Math.min(40, disputes * 8);
  // Ortak düşman
  if (commonEnemies(ctx, a, b) > 0) v += 20;
  // İtibar
  v += (s.countries[a].reputation + s.countries[b].reputation) * 0.1;
  // Sabit kişilik farklılıkları (deterministik)
  v += ((hashString(a < b ? a + b : b + a) % 21) - 10) * 0.5;
  return Math.max(-90, Math.min(90, v));
}
