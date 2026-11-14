/**
 * Birleşmiş Milletler: yaptırım, kınama ve barış gücü kararları. Ülkeler ilişkilerine göre oy verir;
 * ilk beş büyük güç veto edebilir; oy satın alınabilir.
 */
import type { Ctx } from './ctx';
import type { Tag, UNResolution } from './types';
import { addRelation, isFriendly, REBEL_TAG, relation } from './query';
import { notify, newId } from './notify';
import { hasEmbargo, imposeEmbargo } from './diplomacy';
import { applyPeace } from './war';
import { hashString } from './rng';
import { yearsBetween } from './calendar';

export const UN_VETO_POWERS = 5;

function un(ctx: Ctx) {
  return (ctx.s.un ??= { pending: null, next: ctx.s.day + 365, log: [] });
}

function humans(ctx: Ctx): Tag[] {
  return ctx.s.humans ?? [ctx.s.player];
}

export function vetoPowers(ctx: Ctx): Tag[] {
  return (ctx.s.greatPowers ?? []).slice(0, UN_VETO_POWERS);
}

export function buyVoteCost(ctx: Ctx, tag: Tag): number {
  return Math.max(0.05, ctx.s.countries[tag]?.budget.income ?? 0) * 0.5;
}

export interface UNTally {
  yes: Tag[];
  no: Tag[];
  abstain: Tag[];
  vetoBy: Tag | null;
  passed: boolean;
}

/** Yapay zekâ ülkesinin oyu: hedefle ve öneriyi verenle ilişkisine göre */
function aiVote(ctx: Ctx, voter: Tag, r: UNResolution): 'yes' | 'no' | 'abstain' {
  const s = ctx.s;
  if (voter === r.proposer) return 'yes';
  if (voter === r.target) return 'no';
  if (r.kind === 'peacekeeping') {
    const war = r.warId ? s.wars[r.warId] : undefined;
    if (war && (war.attackers.includes(voter) || war.defenders.includes(voter))) return voter === war.attackerLeader ? 'no' : 'yes';
    return 'yes';
  }
  if (isFriendly(ctx, voter, r.target)) return 'no';
  const score = -relation(s, voter, r.target) + relation(s, voter, r.proposer) * 0.5 - s.countries[r.target].reputation * 0.5;
  return score > 15 ? 'yes' : score < -15 ? 'no' : 'abstain';
}

export function tally(ctx: Ctx, r: UNResolution, humanVotes: Record<Tag, 'yes' | 'no' | 'veto'> = {}): UNTally {
  const s = ctx.s;
  const out: UNTally = { yes: [], no: [], abstain: [], vetoBy: null, passed: false };
  const veto = vetoPowers(ctx);
  const hs = humans(ctx);
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG || c.rebelMovement) continue;
    let v: 'yes' | 'no' | 'abstain' | 'veto';
    if (hs.includes(c.tag) && c.tag !== r.proposer) v = humanVotes[c.tag] ?? 'abstain';
    else v = aiVote(ctx, c.tag, r);
    // Veto: yapay zekâ büyük gücü, kendisi ya da dostu hedefse veto eder
    if (veto.includes(c.tag) && !hs.includes(c.tag) && v === 'no' && r.kind !== 'peacekeeping' && (c.tag === r.target || isFriendly(ctx, c.tag, r.target) || relation(s, c.tag, r.target) > 40)) v = 'veto';
    if (v === 'veto') {
      if (veto.includes(c.tag) && !out.vetoBy) out.vetoBy = c.tag;
      out.no.push(c.tag);
    } else out[v].push(c.tag);
  }
  // Satın alınan oylar: çekimserler evet'e döner
  out.abstain.sort();
  for (let i = 0; i < r.bought && out.abstain.length; i++) out.yes.push(out.abstain.shift()!);
  out.passed = !out.vetoBy && out.yes.length > out.no.length;
  return out;
}

function resolve(ctx: Ctx, r: UNResolution, humanVotes: Record<Tag, 'yes' | 'no' | 'veto'> = {}): UNTally {
  const s = ctx.s;
  const t = tally(ctx, r, humanVotes);
  const u = un(ctx);
  u.log.push({ day: s.day, kind: r.kind, target: r.target, proposer: r.proposer, passed: t.passed, vetoBy: t.vetoBy ?? undefined, yes: t.yes.length, no: t.no.length });
  if (u.log.length > 40) u.log.shift();
  const tc = s.countries[r.target];
  notify(
    ctx,
    'diplomacy',
    t.vetoBy ? 'notif.unVetoed' : t.passed ? 'notif.unPassed' : 'notif.unFailed',
    { kind: r.kind, target: tc?.name ?? r.target, by: t.vetoBy ? s.countries[t.vetoBy].name : '', yes: t.yes.length, no: t.no.length },
    { global: true, involves: [r.target, r.proposer], severity: 'info' },
  );
  if (!t.passed) return t;
  if (r.kind === 'sanction') {
    for (const v of t.yes) {
      if (v === r.target || s.countries[v].isPlayer || hasEmbargo(ctx, v, r.target) || isFriendly(ctx, v, r.target)) continue;
      imposeEmbargo(ctx, v, r.target, true);
    }
  } else if (r.kind === 'condemn') {
    tc.reputation = Math.max(-100, tc.reputation - 15);
    tc.stability = Math.max(0, tc.stability - 4);
    for (const v of t.yes) addRelation(s, v, r.target, -5);
  } else {
    const war = r.warId ? s.wars[r.warId] : undefined;
    if (war) applyPeace(ctx, war, war.attackerLeader, war.defenderLeader, [], false);
  }
  return t;
}

/** Karar önerisi. İnsan büyük güçler varsa oyları beklenir; yoksa hemen oylanır. */
export function propose(ctx: Ctx, proposer: Tag, kind: UNResolution['kind'], target: Tag, warId?: string, bought = 0): { ok: boolean; error?: string; tally?: UNTally } {
  const s = ctx.s;
  const u = un(ctx);
  const pc = s.countries[proposer];
  if (!pc?.alive) return { ok: false, error: 'err.invalidTarget' };
  if (u.pending) return { ok: false, error: 'un.busy' };
  if (kind === 'peacekeeping') {
    const war = warId ? s.wars[warId] : undefined;
    if (!war || war.goal.type === 'rebellion') return { ok: false, error: 'err.invalidTarget' };
    if (yearsBetween(war.startDay, s.day) < 1) return { ok: false, error: 'un.warTooYoung' };
    target = war.attackerLeader;
  } else if (!s.countries[target]?.alive || target === proposer || target === REBEL_TAG) return { ok: false, error: 'err.invalidTarget' };
  const key = 'un';
  if ((pc.ai.cooldowns[key] ?? -Infinity) > s.day) return { ok: false, error: 'err.cooldown' };
  const n = Math.max(0, Math.min(20, Math.round(bought)));
  const cost = n * buyVoteCost(ctx, proposer);
  if (pc.treasury < cost) return { ok: false, error: 'err.noMoney' };
  pc.treasury -= cost;
  pc.ai.cooldowns[key] = s.day + 365;
  const r: UNResolution = { id: newId(ctx, 'un'), kind, proposer, target, warId, day: s.day, expires: s.day + 30, bought: n };
  // Oyunu bekleyeceğimiz insan oyuncular (öneren hariç)
  const waiting = humans(ctx).filter((h) => h !== proposer && s.countries[h]?.alive);
  if (waiting.length) {
    u.pending = r;
    for (const h of waiting) notify(ctx, 'diplomacy', 'notif.unVoteAsked', { kind, target: s.countries[target].name }, { involves: [h], severity: 'info' });
    return { ok: true };
  }
  return { ok: true, tally: resolve(ctx, r) };
}

const votes = new WeakMap<object, Record<Tag, 'yes' | 'no' | 'veto'>>();

export function castVote(ctx: Ctx, voter: Tag, vote: 'yes' | 'no' | 'veto'): { ok: boolean; error?: string } {
  const s = ctx.s;
  const u = un(ctx);
  const r = u.pending;
  if (!r || voter === r.proposer) return { ok: false, error: 'err.notFound' };
  if (vote === 'veto' && !vetoPowers(ctx).includes(voter)) return { ok: false, error: 'un.noVeto' };
  const v = votes.get(r) ?? {};
  v[voter] = vote;
  votes.set(r, v);
  const waiting = humans(ctx).filter((h) => h !== r.proposer && s.countries[h]?.alive && !v[h]);
  if (!waiting.length) {
    u.pending = null;
    resolve(ctx, r, v);
  }
  return { ok: true };
}

/** Aylık: süresi dolan oylama sonuçlanır; yılda bir yapay zekâ büyük gücü karar önerir */
export function unTick(ctx: Ctx): void {
  const s = ctx.s;
  const u = un(ctx);
  if (u.pending && u.pending.expires <= s.day) {
    const r = u.pending;
    u.pending = null;
    resolve(ctx, r, votes.get(r) ?? {});
  }
  if (u.pending || s.day < u.next) return;
  u.next = s.day + 330 + (hashString(`un|${s.day}`) % 90);
  const powers = (s.greatPowers ?? []).filter((t) => s.countries[t]?.alive && !s.countries[t].isPlayer);
  if (!powers.length) return;
  const proposer = powers[hashString(`unp|${s.day}`) % powers.length];
  const pc = s.countries[proposer];
  // Uzun süren savaşa barış gücü ya da düşmana yaptırım/kınama
  const longWar = Object.values(s.wars).find((w) => w.goal.type !== 'rebellion' && yearsBetween(w.startDay, s.day) >= 3 && !w.attackers.includes(proposer) && !w.defenders.includes(proposer));
  pc.ai.cooldowns.un = -Infinity;
  if (longWar && hashString(`unk|${s.day}`) % 2 === 0) {
    propose(ctx, proposer, 'peacekeeping', longWar.attackerLeader, longWar.id);
    return;
  }
  let worst: Tag | null = null;
  let worstRel = -40;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === proposer || c.tag === REBEL_TAG || c.rebelMovement) continue;
    const rel = relation(s, proposer, c.tag) + c.reputation * 0.5;
    if (rel < worstRel) {
      worstRel = rel;
      worst = c.tag;
    }
  }
  if (worst) propose(ctx, proposer, hashString(`unt|${s.day}`) % 2 === 0 ? 'sanction' : 'condemn', worst);
}
