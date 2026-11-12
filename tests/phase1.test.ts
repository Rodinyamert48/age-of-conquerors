import { describe, it, expect } from 'vitest';
import { newModernGame, provinceByName } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { createArmy } from '@/game/construction';
import { armiesAt, provincesOf, invalidateArmies, invalidateControl } from '@/game/ctx';
import { armySoldiers } from '@/game/query';
import { captureProvince } from '@/game/siege';
import { applyPeace } from '@/game/war';
import { applyEffects } from '@/game/events';
import { TECH_PREREQ } from '@/game/defs/techs';
import { getEventDefs } from '@/game/data/events';
import type { PeaceTerm } from '@/game/types';
import type { Ctx } from '@/game/ctx';

function warWith(ctx: Ctx, a: string, b: string) {
  return Object.values(ctx.s.wars).find((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)))!;
}

describe('Faz 1 — nükleer silah', () => {
  it('yalnızca nükleer güçlerde başlangıçta vardır; teknoloji sırası bozulmaz', () => {
    const ctx = newModernGame();
    expect(ctx.s.countries.RUS.techs).toContain('t_nuclear');
    expect(ctx.s.countries.RUS.nukes).toBeGreaterThan(0);
    expect(ctx.s.countries.TUR.techs).not.toContain('t_nuclear');
    expect(ctx.s.countries.DEU.techs).not.toContain('t_nuclear');
    expect(TECH_PREREQ.t_jets).not.toBe('t_nuclear');
    expect(TECH_PREREQ.t_nuclear).toBe('t_self_propelled');
  });

  it('üretim para harcar; teknolojisiz ülke üretemez', () => {
    const ctx = newModernGame({ player: 'USA' });
    const usa = ctx.s.countries.USA;
    const n0 = usa.nukes ?? 0;
    const t0 = usa.treasury;
    expect(runCommand(ctx, { type: 'buildNuke' }).ok).toBe(true);
    expect(usa.nukes).toBe(n0 + 1);
    expect(usa.treasury).toBeLessThan(t0);
    const tur = newModernGame();
    expect(runCommand(tur, { type: 'buildNuke' }).error).toBe('nuke.needsTech');
  });

  it('saldırı yalnızca savaştaki ülkeye yapılır; ordular ve nüfus yok olur; karşılık gelir', () => {
    const ctx = newModernGame({ player: 'USA' });
    const target = provinceByName(ctx.w, 'RUS', 'Moskova');
    expect(runCommand(ctx, { type: 'launchNuke', province: target }).error).toBe('nuke.needsWar');
    runCommand(ctx, { type: 'declareWar', target: 'RUS' });
    createArmy(ctx, 'RUS', target, { infantry: 40000 });
    const pop = ctx.s.provinces[target].pop;
    const usa = ctx.s.countries.USA;
    const rus = ctx.s.countries.RUS;
    const nu = usa.nukes!;
    const nr = rus.nukes!;
    const rep = usa.reputation;
    expect(runCommand(ctx, { type: 'launchNuke', province: target }).ok).toBe(true);
    expect(armiesAt(ctx, target)).toHaveLength(0);
    expect(ctx.s.provinces[target].pop).toBeLessThan(pop * 0.6);
    expect(usa.nukes).toBe(nu - 1);
    expect(usa.reputation).toBeLessThan(rep - 30);
    expect(rus.nukes).toBe(nr - 1); // Rusya karşılık verdi
    expect(ctx.s.notifications.some((n) => n.key === 'notif.nukeLaunched')).toBe(true);
  });
});

describe('Faz 1 — iç savaş olayları', () => {
  it('iç savaş etkisi asi devleti kurar, bölgeleri ele geçirir ve bağımsızlık savaşı başlatır', () => {
    const ctx = newModernGame();
    const def = getEventDefs().find((e) => e.id === 'modern_syria_civil_war')!;
    expect(def).toBeTruthy();
    applyEffects(ctx, 'SYR', def.options[0].effects);
    const sdf = ctx.s.countries.SDF;
    expect(sdf.alive).toBe(true);
    const raqqa = provinceByName(ctx.w, 'SYR', 'Rakka');
    expect(ctx.s.provinces[raqqa].controller).toBe('SDF');
    expect(ctx.s.provinces[raqqa].cores).toContain('SDF');
    expect(Object.values(ctx.s.wars).some((w) => w.attackers.includes('SDF') && w.defenders.includes('SYR') && w.goal.type === 'independence')).toBe(true);
    for (let i = 0; i < 20; i++) advanceTurn(ctx);
    expect(ctx.s.countries.SYR.alive).toBe(true);
  });

  it('barışta "bağımsızlık" şartıyla asi devlet ülke olarak kalır', () => {
    const ctx = newModernGame();
    const def = getEventDefs().find((e) => e.id === 'modern_syria_civil_war')!;
    applyEffects(ctx, 'SYR', def.options[0].effects);
    const war = warWith(ctx, 'SDF', 'SYR');
    expect(ctx.s.countries.SDF.rebelMovement).toBe(true);
    // Asiler kazandı: bağımsızlık şartlı barış
    applyPeace(ctx, war, 'SDF', 'SYR', [{ type: 'release', nation: 'SDF' }], false);
    expect(ctx.s.countries.SDF.alive).toBe(true);
    expect(ctx.s.countries.SDF.rebelMovement).toBe(false);
    const raqqa = provinceByName(ctx.w, 'SYR', 'Rakka');
    expect(ctx.s.provinces[raqqa].owner).toBe('SDF');
    expect(ctx.s.wars[war.id]).toBeUndefined();
  });
});

describe('Faz 1 — asker sayısı seçimi', () => {
  it('moveArmy amount ile yalnızca seçilen sayıda asker yola çıkar', () => {
    const ctx = newModernGame();
    const ankara = provinceByName(ctx.w, 'TUR', 'Ankara');
    const konya = provinceByName(ctx.w, 'TUR', 'Konya');
    const a = createArmy(ctx, 'TUR', ankara, { infantry: 40000 });
    const before = armySoldiers(a);
    const r = runCommand(ctx, { type: 'moveArmy', army: a.id, target: konya, amount: 10000 });
    expect(r.ok).toBe(true);
    const movedId = (r.data as { army: string }).army;
    const moved = ctx.s.armies[movedId];
    expect(armySoldiers(moved)).toBe(10000);
    expect(moved.path.length).toBeGreaterThan(0);
    expect(armySoldiers(ctx.s.armies[a.id])).toBe(before - 10000);
    expect(ctx.s.armies[a.id].path).toHaveLength(0);
    invalidateArmies(ctx);
  });
});

describe('Faz 1 — barış müzakeresi (AoH2)', () => {
  function setup() {
    const ctx = newModernGame();
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    const war = warWith(ctx, 'TUR', 'SYR');
    const syr = provincesOf(ctx, 'SYR').filter((p) => p !== ctx.s.countries.SYR.capital);
    for (const p of syr.slice(0, 3)) captureProvince(ctx, p, 'TUR');
    invalidateControl(ctx);
    return { ctx, war, syr: syr.slice(0, 3) };
  }

  it('yalnızca seçilen toprak alınır; alınmayan işgal bölgeleri sahibine döner', () => {
    const { ctx, war, syr } = setup();
    war.score = 60;
    const r = runCommand(ctx, { type: 'proposePeace', war: war.id, target: 'SYR', beneficiary: 'TUR', terms: [{ type: 'province', province: syr[0] }] });
    expect((r.data as { accepted: boolean }).accepted).toBe(true);
    expect(ctx.s.provinces[syr[0]].owner).toBe('TUR');
    expect(ctx.s.provinces[syr[1]].owner).toBe('SYR');
    expect(ctx.s.provinces[syr[1]].controller).toBe('SYR');
  });

  it('takas: karşılığında bölge verilebilir, verilen bölge karşı tarafa geçer', () => {
    const { ctx, war, syr } = setup();
    war.score = 60;
    const give = provinceByName(ctx.w, 'TUR', 'Adana');
    const terms: PeaceTerm[] = [
      { type: 'province', province: syr[0] },
      { type: 'give', province: give },
    ];
    const r = runCommand(ctx, { type: 'proposePeace', war: war.id, target: 'SYR', beneficiary: 'TUR', terms });
    expect((r.data as { accepted: boolean }).accepted).toBe(true);
    expect(ctx.s.provinces[syr[0]].owner).toBe('TUR');
    expect(ctx.s.provinces[give].owner).toBe('SYR');
    // Kendi başkentini veremez
    const cap = ctx.s.countries.TUR.capital;
    const bad = runCommand(ctx, { type: 'proposePeace', war: warWith(ctx, 'TUR', 'SYR')?.id ?? 'x', target: 'SYR', beneficiary: 'TUR', terms: [{ type: 'give', province: cap }] });
    expect(bad.ok).toBe(false);
  });
});
