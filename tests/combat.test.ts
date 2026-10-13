import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { createArmy } from '@/game/construction';
import { detectBattles, predictBattle, simContextAt, simulateBattle, toSim } from '@/game/combat';
import { landNeighbors } from '@/game/world';
import { armySoldiers } from '@/game/query';
import type { Ctx } from '@/game/ctx';
import { nextRandom } from '@/game/rng';

function borderPair(ctx: Ctx, from: string, to: string): [number, number] {
  for (let p = 0; p < ctx.w.P; p++) {
    if (ctx.s.provinces[p].owner !== from) continue;
    const n = landNeighbors(ctx.w, p).find((q) => ctx.s.provinces[q].owner === to);
    if (n !== undefined) return [p, n];
  }
  throw new Error('sınır yok');
}

function seeded(seed: number) {
  let st = seed;
  return () => {
    const [n, v] = nextRandom(st);
    st = n;
    return v;
  };
}

describe('muharebe', () => {
  it('güçlü ordu kazanır, iki taraf da kayıp verir', () => {
    const ctx = newModernGame();
    const [, sp] = borderPair(ctx, 'TUR', 'SYR');
    const strong = createArmy(ctx, 'TUR', sp, { infantry: 60000, artillery: 10000, armor: 8000 }, { morale: 1 });
    const weak = createArmy(ctx, 'SYR', sp, { infantry: 15000 }, { morale: 0.8 });
    const sc = simContextAt(ctx, sp, 'SYR');
    const r = simulateBattle([toSim(ctx, strong)], [toSim(ctx, weak)], sc, seeded(7));
    expect(r.winner).toBe('attacker');
    expect(r.attLoss).toBeGreaterThan(0);
    expect(r.defLoss).toBeGreaterThan(r.attLoss);
    const p = predictBattle([toSim(ctx, strong)], [toSim(ctx, weak)], sc);
    expect(p.attackerWinChance).toBeGreaterThan(0.8);
    // Tahmin oyunun RNG durumunu değiştirmez
    const rng = ctx.s.rng;
    predictBattle([toSim(ctx, weak)], [toSim(ctx, strong)], sc);
    expect(ctx.s.rng).toBe(rng);
  });

  it('arazi ve tahkimat savunmaya avantaj sağlar', () => {
    const ctx = newModernGame();
    const [, sp] = borderPair(ctx, 'TUR', 'SYR');
    const a = createArmy(ctx, 'TUR', sp, { infantry: 30000 }, { morale: 1 });
    const d = createArmy(ctx, 'SYR', sp, { infantry: 30000 }, { morale: 1 });
    const flat = { ...simContextAt(ctx, sp, 'SYR'), terrain: 'plains' as const, fort: 0 };
    const hard = { ...flat, terrain: 'mountains' as const, fort: 3 };
    const pf = predictBattle([toSim(ctx, a)], [toSim(ctx, d)], flat);
    const ph = predictBattle([toSim(ctx, a)], [toSim(ctx, d)], hard);
    expect(ph.attackerWinChance).toBeLessThanOrEqual(pf.attackerWinChance);
    expect(ph.attLoss / Math.max(1, ph.defLoss)).toBeGreaterThan(pf.attLoss / Math.max(1, pf.defLoss));
  });

  it('oyundaki muharebe sonuçları ordulara, savaşa ve rapora uygulanır', () => {
    const ctx = newModernGame();
    const [, sp] = borderPair(ctx, 'TUR', 'SYR');
    expect(runCommand(ctx, { type: 'declareWar', target: 'SYR' }).ok).toBe(true);
    const war = Object.values(ctx.s.wars).find((w) => w.attackers.includes('TUR'))!;
    // Bölgedeki mevcut Suriye ordularını çıkar: kontrollü bir muharebe kur
    for (const a of Object.values(ctx.s.armies)) if (a.location === sp) delete ctx.s.armies[a.id];
    const att = createArmy(ctx, 'TUR', sp, { infantry: 80000, artillery: 10000, armor: 10000 }, { morale: 1 });
    const def = createArmy(ctx, 'SYR', sp, { infantry: 20000 }, { morale: 0.9 });
    const att0 = armySoldiers(att);
    const def0 = armySoldiers(def);
    const reports0 = ctx.s.battleReports.length;
    detectBattles(ctx);
    const battleId = ctx.s.armies[att.id].battle;
    expect(battleId).toBeTruthy();
    let guard = 0;
    while (ctx.s.battles[battleId!] && guard++ < 120) advanceTurn(ctx);
    expect(ctx.s.battles[battleId!]).toBeUndefined();
    expect(ctx.s.battleReports.length).toBeGreaterThan(reports0);
    const rep = ctx.s.battleReports[ctx.s.battleReports.length - 1];
    expect(rep.location).toBe(sp);
    expect(rep.winner).toBe(rep.attacker.tag === 'TUR' ? 'attacker' : 'defender');
    expect(armySoldiers(ctx.s.armies[att.id])).toBeLessThan(att0);
    const d = ctx.s.armies[def.id];
    if (d) {
      expect(armySoldiers(d)).toBeLessThan(def0);
      expect(d.location === sp && !d.path.length).toBe(false); // yenilen geri çekilir
    }
    expect(war.losses.attackers + war.losses.defenders).toBeGreaterThan(0);
    expect(war.battleScore).toBeGreaterThan(0);
  });

  it('kuşatma sonunda bölge işgal edilir ve savaş skoruna yansır', () => {
    const ctx = newModernGame();
    const [, sp] = borderPair(ctx, 'TUR', 'SYR');
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    const war = Object.values(ctx.s.wars).find((w) => w.attackers.includes('TUR'))!;
    for (const a of Object.values(ctx.s.armies)) if (a.location === sp) delete ctx.s.armies[a.id];
    createArmy(ctx, 'TUR', sp, { infantry: 60000, artillery: 15000 }, { morale: 1 });
    let guard = 0;
    while (ctx.s.provinces[sp].controller !== 'TUR' && guard++ < 200) advanceTurn(ctx);
    expect(ctx.s.provinces[sp].controller).toBe('TUR');
    expect(ctx.s.provinces[sp].owner).toBe('SYR'); // işgal, ilhak değildir
    expect(war.score).toBeGreaterThan(0);
  });
});
