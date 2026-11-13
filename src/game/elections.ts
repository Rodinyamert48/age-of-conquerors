/**
 * Seçimler: demokratik ülkelerde 4 yılda bir. İktidar kaybederse kabine düşer (bakanlar yeniden atanır)
 * ve politika yönü değişir. İnsan oyuncuya seçimden önce kampanya kararı sorulur.
 */
import type { Ctx } from './ctx';
import type { Country, PolicyId } from './types';
import { POLICY_IDS } from './types';
import { GOVERNMENT_DEFS } from './defs/policies';
import { REBEL_TAG } from './query';
import { chance, hashString } from './rng';
import { notify, newId } from './notify';
import { appointMinisters, MINISTER_ROLES, type MinisterRole } from './ministers';

export const ELECTION_YEARS = 4;
const TERM = Math.round(ELECTION_YEARS * 365.25);

export function isDemocratic(c: Country): boolean {
  return GOVERNMENT_DEFS[c.government]?.group === 'democratic';
}

function isHuman(ctx: Ctx, tag: string): boolean {
  return (ctx.s.humans ?? [ctx.s.player]).includes(tag);
}

export function electionWinChance(c: Country): number {
  const p = 0.5 + (c.stability - 50) / 100 - c.warExhaustion / 200 - (c.treasury < 0 ? 0.08 : 0) + (c.electionBonus ?? 0);
  return Math.max(0.1, Math.min(0.93, p));
}

export function holdElection(ctx: Ctx, c: Country, forceResult?: boolean): boolean {
  const s = ctx.s;
  const won = forceResult ?? chance(s, electionWinChance(c));
  c.nextElection = s.day + TERM;
  c.electionBonus = 0;
  c.campaignAsked = false;
  c.lastElection = { day: s.day, won };
  if (won) {
    c.stability = Math.min(100, c.stability + 3);
  } else {
    // Kabine düşer
    if (isHuman(ctx, c.tag)) {
      c.ministers = undefined;
    } else {
      const h = hashString(`${c.tag}|elect|${s.day}`);
      const picks: Partial<Record<MinisterRole, number>> = {};
      MINISTER_ROLES.forEach((r, i) => (picks[r] = (h + i * 13) % 3));
      appointMinisters(ctx, c.tag, picks);
    }
    // Politika yönü değişir: iki politika bir kademe kayar
    const h = hashString(`${c.tag}|policy|${s.day}`);
    for (let k = 0; k < 2; k++) {
      const pid = POLICY_IDS[(h + k * 3) % POLICY_IDS.length] as PolicyId;
      const dir = ((h >> (k + 2)) & 1) === 0 ? 1 : -1;
      c.policies[pid] = Math.max(0, Math.min(4, c.policies[pid] + dir));
    }
    c.stability = Math.min(100, c.stability + 2);
    c.tempMods = c.tempMods.filter((m) => m.id !== 'transition');
    c.tempMods.push({ id: 'transition', label: 'mod.transition', until: s.day + 365, mods: { taxEfficiency: -0.04 } });
  }
  notify(ctx, 'event', won ? 'notif.electionWon' : 'notif.electionLost', { country: c.name }, { severity: won ? 'good' : 'bad', involves: [c.tag], focus: { country: c.tag } });
  return won;
}

/** Aylık seçim takvimi */
export function electionTick(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of Object.values(s.countries)) {
    if (!c.alive || c.tag === REBEL_TAG || c.rebelMovement) continue;
    if (!isDemocratic(c)) {
      c.nextElection = undefined;
      continue;
    }
    // İlk seçim tarihleri ülkeden ülkeye dağılır
    if (c.nextElection === undefined) c.nextElection = s.day + 200 + (hashString(`${c.tag}|election`) % (TERM - 200));
    if (isHuman(ctx, c.tag) && !c.campaignAsked && c.nextElection - s.day <= 90 && c.nextElection > s.day) {
      c.campaignAsked = true;
      s.pendingEvents.push({ uid: newId(ctx, 'e'), eventId: 'election_campaign', country: c.tag, day: s.day, expires: Math.min(c.nextElection, s.day + 60) });
      notify(ctx, 'event', 'notif.eventFired', { event: 'election_campaign' }, { severity: 'info', involves: [c.tag] });
    }
    if (s.day >= c.nextElection) holdElection(ctx, c);
  }
}
