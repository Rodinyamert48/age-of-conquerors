/**
 * Oyuncu komutları. Arayüz yalnızca bu komutlar aracılığıyla durumu değiştirir; her komut
 * doğrulanır ve anlaşılır bir hata anahtarı döndürür.
 */
import type { ArmyUnits, BuildingId, CommandResult, DiploActionType, PeaceTerm, PolicyId, Tag, TimeStep, UnitType } from './types';
import { POLICY_IDS } from './types';
import { invalidateArmies, warsOf, type Ctx } from './ctx';
import { findPath } from './movement';
import { armySize, atWar, warSide, REBEL_TAG } from './query';
import { buildingAvailability, cancelConstruction, canResearch, createArmy, mergeInto, startConstruction, startRecruit } from './construction';
import { computeAllBudgets } from './economy';
import { performAction, answerProposal } from './diplomacy';
import { applyPeace, callToArms, canDeclareWar, declareWar, evaluatePeace, termsCost, validTerm } from './war';
import { assault } from './siege';
import { resolvePendingEvent } from './events';
import { switchPlayer } from './engine';
import { UNIT_DEFS } from './defs/units';

export type Command =
  | { type: 'moveArmy'; army: string; target: number }
  | { type: 'stopArmy'; army: string }
  | { type: 'mergeArmies'; armies: string[] }
  | { type: 'splitArmy'; army: string; units: Partial<ArmyUnits> }
  | { type: 'disbandArmy'; army: string }
  | { type: 'renameArmy'; army: string; name: string }
  | { type: 'recruit'; province: number; unit: UnitType; amount: number }
  | { type: 'cancelRecruit'; province: number; index: number }
  | { type: 'build'; province: number; building: BuildingId }
  | { type: 'cancelBuild'; province: number }
  | { type: 'setPolicy'; policy: PolicyId; level: number }
  | { type: 'setResearch'; tech: string | null }
  | { type: 'diplomacy'; action: DiploActionType; target: Tag; province?: number }
  | { type: 'answerProposal'; id: string; accept: boolean }
  | { type: 'declareWar'; target: Tag }
  | { type: 'callToArms'; war: string; ally: Tag }
  | { type: 'proposePeace'; war: string; target: Tag; beneficiary: Tag; terms: PeaceTerm[] }
  | { type: 'answerPeace'; id: string; accept: boolean }
  | { type: 'assault'; province: number }
  | { type: 'resolveEvent'; uid: string; option: number }
  | { type: 'acknowledgeGameOver' }
  | { type: 'switchCountry'; tag: Tag }
  | { type: 'setTimeStep'; step: TimeStep };

const ok = (data?: unknown): CommandResult => ({ ok: true, data });
const fail = (error: string, errorParams?: Record<string, string | number>): CommandResult => ({ ok: false, error, errorParams });

export function runCommand(ctx: Ctx, cmd: Command): CommandResult {
  const r = dispatch(ctx, cmd);
  if (r.ok) computeAllBudgets(ctx);
  return r;
}

function ownArmy(ctx: Ctx, id: string) {
  const a = ctx.s.armies[id];
  if (!a || a.owner !== ctx.s.player) return null;
  return a;
}

function dispatch(ctx: Ctx, cmd: Command): CommandResult {
  const s = ctx.s;
  const me = s.player;
  if (s.gameOver && !s.gameOver.acknowledged && cmd.type !== 'acknowledgeGameOver' && cmd.type !== 'switchCountry') return fail('err.gameOver');
  switch (cmd.type) {
    case 'moveArmy': {
      const a = ownArmy(ctx, cmd.army);
      if (!a) return fail('err.notFound');
      if (a.battle) return fail('err.inBattle');
      if (cmd.target < 0 || cmd.target >= ctx.w.N) return fail('err.invalidTarget');
      if (!a.isNavy && cmd.target >= ctx.w.P) return fail('move.landToSea');
      if (a.isNavy && cmd.target < ctx.w.P && !ctx.w.coastal[cmd.target]) return fail('move.navyInland');
      if (cmd.target === a.location) {
        a.path = [];
        a.progress = 0;
        return ok({ days: 0 });
      }
      const res = findPath(ctx, a, cmd.target);
      if (!res) return fail('move.noPath');
      // İlerleme yalnızca aynı ilk adıma devam ediliyorsa korunur
      if (a.path[0] !== res.path[0]) a.progress = 0;
      a.path = res.path;
      a.aiTarget = null;
      return ok({ days: res.days });
    }
    case 'stopArmy': {
      const a = ownArmy(ctx, cmd.army);
      if (!a) return fail('err.notFound');
      a.path = [];
      a.progress = 0;
      return ok();
    }
    case 'mergeArmies': {
      const list = cmd.armies.map((id) => ownArmy(ctx, id)).filter((a): a is NonNullable<typeof a> => !!a);
      if (list.length < 2) return fail('army.mergeNeedsTwo');
      const loc = list[0].location;
      if (list.some((a) => a.location !== loc || a.battle || a.isNavy !== list[0].isNavy)) return fail('army.mergeSameLocation');
      const target = list[0];
      for (const a of list.slice(1)) mergeInto(ctx, target, a);
      target.path = [];
      target.progress = 0;
      return ok({ army: target.id });
    }
    case 'splitArmy': {
      const a = ownArmy(ctx, cmd.army);
      if (!a) return fail('err.notFound');
      if (a.battle) return fail('err.inBattle');
      const take: Partial<ArmyUnits> = {};
      let total = 0;
      for (const [k, v] of Object.entries(cmd.units) as [UnitType, number][]) {
        const n = Math.max(0, Math.min(a.units[k], Math.floor(v)));
        if (n > 0) {
          take[k] = n;
          total += n;
        }
      }
      if (total <= 0) return fail('army.splitEmpty');
      const remaining = armySize(a) - total;
      if (remaining <= 0) return fail('army.splitAll');
      for (const [k, v] of Object.entries(take) as [UnitType, number][]) a.units[k] -= v;
      const b = createArmy(ctx, me, a.location, take, { morale: a.morale, experience: a.experience });
      b.isNavy = a.isNavy;
      b.path = a.path.slice();
      b.progress = a.progress;
      b.supply = a.supply;
      invalidateArmies(ctx);
      return ok({ army: b.id });
    }
    case 'disbandArmy': {
      const a = ownArmy(ctx, cmd.army);
      if (!a) return fail('err.notFound');
      if (a.battle) return fail('err.inBattle');
      const c = s.countries[me];
      // Terhis edilen askerlerin yarısı insan gücüne döner (yalnızca kendi topraklarında)
      if (a.location < ctx.w.P && s.provinces[a.location].controller === me) {
        let mp = 0;
        for (const [k, v] of Object.entries(a.units) as [UnitType, number][]) mp += v * UNIT_DEFS[k].manpower;
        c.manpower += mp * 0.5;
      }
      delete s.armies[a.id];
      invalidateArmies(ctx);
      return ok();
    }
    case 'renameArmy': {
      const a = ownArmy(ctx, cmd.army);
      if (!a) return fail('err.notFound');
      const name = cmd.name.trim().slice(0, 40);
      if (!name) return fail('err.invalidName');
      a.name = name;
      return ok();
    }
    case 'recruit': {
      if (!Number.isFinite(cmd.amount) || cmd.amount <= 0) return fail('recruit.invalidAmount');
      const r = startRecruit(ctx, me, cmd.province, cmd.unit, Math.floor(cmd.amount));
      return r.ok ? ok({ days: r.days, cost: r.cost }) : fail(r.reason ?? 'err.unknown', r.reasonParams);
    }
    case 'cancelRecruit': {
      const ps = s.provinces[cmd.province];
      if (!ps || ps.owner !== me) return fail('err.notFound');
      const job = ps.recruits[cmd.index];
      if (!job) return fail('err.notFound');
      ps.recruits.splice(cmd.index, 1);
      s.countries[me].manpower += job.amount * UNIT_DEFS[job.unit].manpower;
      return ok();
    }
    case 'build': {
      const r = startConstruction(ctx, me, cmd.province, cmd.building);
      return r.ok ? ok({ days: r.days, cost: r.cost }) : fail(r.reason ?? 'err.unknown', r.reasonParams);
    }
    case 'cancelBuild': {
      return cancelConstruction(ctx, me, cmd.province) ? ok() : fail('err.notFound');
    }
    case 'setPolicy': {
      if (!POLICY_IDS.includes(cmd.policy)) return fail('err.invalidTarget');
      const lvl = Math.round(cmd.level);
      if (lvl < 0 || lvl > 4) return fail('err.invalidTarget');
      s.countries[me].policies[cmd.policy] = lvl;
      return ok();
    }
    case 'setResearch': {
      const c = s.countries[me];
      if (cmd.tech === null) {
        c.research.current = null;
        return ok();
      }
      const chk = canResearch(ctx, me, cmd.tech);
      if (!chk.ok) return fail(chk.reason ?? 'err.unknown');
      if (c.research.current !== cmd.tech) {
        // Konu değiştirilirse birikmiş puanın yarısı korunur
        c.research.progress *= c.research.current ? 0.5 : 1;
        c.research.current = cmd.tech;
      }
      return ok();
    }
    case 'diplomacy': {
      const r = performAction(ctx, me, cmd.target, cmd.action, cmd.province);
      if (!r.ok) return fail(r.error ?? 'err.unknown');
      return ok({ accepted: r.accepted, evaluation: r.evaluation });
    }
    case 'answerProposal': {
      const r = answerProposal(ctx, cmd.id, cmd.accept);
      return r.ok ? ok({ accepted: r.accepted }) : fail(r.error ?? 'err.unknown');
    }
    case 'declareWar': {
      const chk = canDeclareWar(ctx, me, cmd.target);
      if (!chk.ok) return fail(chk.error ?? 'err.unknown');
      const war = declareWar(ctx, me, cmd.target, { type: 'conquest' });
      if (!war) return fail('err.unknown');
      s.countries[me].ai.lastWarDecl = s.day;
      return ok({ war: war.id, broken: chk.breaks.map((t) => t.type), justified: chk.justified });
    }
    case 'callToArms': {
      const war = s.wars[cmd.war];
      if (!war || !warSide(war, me)) return fail('err.notFound');
      const joined = callToArms(ctx, war, me, cmd.ally);
      return ok({ joined });
    }
    case 'proposePeace': {
      const war = s.wars[cmd.war];
      if (!war) return fail('err.notFound');
      const mySide = warSide(war, me);
      const theirSide = warSide(war, cmd.target);
      if (!mySide || !theirSide || mySide === theirSide) return fail('err.invalidTarget');
      if (cmd.target === REBEL_TAG) return fail('peace.rebels');
      const iAmLeader = war.attackerLeader === me || war.defenderLeader === me;
      const theyLead = war.attackerLeader === cmd.target || war.defenderLeader === cmd.target;
      if (!iAmLeader && !theyLead) return fail('peace.needLeader');
      if (cmd.beneficiary !== me && cmd.beneficiary !== cmd.target) return fail('err.invalidTarget');
      const loser = cmd.beneficiary === me ? cmd.target : me;
      for (const t of cmd.terms) if (!validTerm(ctx, war, cmd.beneficiary, loser, t)) return fail('peace.invalidTerms');
      const separate = !(iAmLeader && theyLead);
      const ev = evaluatePeace(ctx, war, me, cmd.target, cmd.beneficiary, cmd.terms);
      if (ev.accept) {
        applyPeace(ctx, war, cmd.beneficiary, loser, cmd.terms, separate);
        return ok({ accepted: true, cost: ev.cost, willingness: ev.willingness });
      }
      return ok({ accepted: false, counter: ev.counter, reason: ev.reasonKey, cost: ev.cost, willingness: ev.willingness });
    }
    case 'answerPeace': {
      const offer = s.peaceOffers.find((o) => o.id === cmd.id);
      if (!offer) return fail('err.notFound');
      s.peaceOffers = s.peaceOffers.filter((o) => o !== offer);
      const war = s.wars[offer.warId];
      if (!war) return fail('err.notFound');
      if (!cmd.accept) return ok({ accepted: false });
      const loser = offer.beneficiary === offer.from ? offer.to : offer.from;
      const separate = !((war.attackerLeader === offer.from || war.defenderLeader === offer.from) && (war.attackerLeader === offer.to || war.defenderLeader === offer.to));
      const validTerms = offer.terms.filter((t) => validTerm(ctx, war, offer.beneficiary, loser, t));
      applyPeace(ctx, war, offer.beneficiary, loser, validTerms, separate);
      return ok({ accepted: true });
    }
    case 'assault': {
      const ps = s.provinces[cmd.province];
      if (!ps?.siege || ps.siege.by !== me) return fail('siege.notBesieging');
      const r = assault(ctx, cmd.province);
      if (!r) return fail('siege.cannotAssault');
      return ok(r);
    }
    case 'resolveEvent': {
      return resolvePendingEvent(ctx, cmd.uid, cmd.option) ? ok() : fail('err.notFound');
    }
    case 'acknowledgeGameOver': {
      if (s.gameOver) s.gameOver.acknowledged = true;
      return ok();
    }
    case 'switchCountry': {
      if (s.gameOver?.result !== 'defeat' || !s.rules.continueAfterDefeat) return fail('err.notAllowed');
      return switchPlayer(ctx, cmd.tag) ? ok() : fail('err.invalidTarget');
    }
    case 'setTimeStep': {
      if (!['day', 'week', 'month'].includes(cmd.step)) return fail('err.invalidTarget');
      s.rules.timeStep = cmd.step;
      return ok();
    }
  }
}

/** Savaş ilanı önizlemesi (onay ekranı için) */
export function warPreview(ctx: Ctx, target: Tag) {
  const chk = canDeclareWar(ctx, ctx.s.player, target);
  return { ...chk, breaks: chk.breaks.map((t) => t.type) };
}

export function peaceCost(ctx: Ctx, warId: string, beneficiary: Tag, loser: Tag, terms: PeaceTerm[]): number {
  const war = ctx.s.wars[warId];
  if (!war) return 0;
  return termsCost(ctx, war, beneficiary, loser, terms);
}

export function playerWars(ctx: Ctx) {
  return warsOf(ctx, ctx.s.player);
}

export { buildingAvailability, atWar };
