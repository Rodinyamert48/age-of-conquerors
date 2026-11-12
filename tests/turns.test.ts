import { describe, it, expect } from 'vitest';
import { newModernGame, provinceByName } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { createArmy } from '@/game/construction';
import { pathTurns } from '@/game/movement';
import { landNeighbors } from '@/game/world';
import { invalidateArmies, invalidateControl, provincesOf, type Ctx } from '@/game/ctx';
import { armySoldiers } from '@/game/query';

function borderPair(ctx: Ctx, from: string, to: string): [number, number] {
  for (let p = 0; p < ctx.w.P; p++) {
    if (ctx.s.provinces[p].owner !== from) continue;
    const n = landNeighbors(ctx.w, p).find((q) => ctx.s.provinces[q].owner === to);
    if (n !== undefined) return [p, n];
  }
  throw new Error('sınır yok');
}

describe('tur sistemi ve toprak ele geçirme (Age of History 2 düzeni)', () => {
  it('ordu her turda karada tam bir bölge ilerler', () => {
    const ctx = newModernGame();
    const ankara = provinceByName(ctx.w, 'TUR', 'Ankara');
    const army = createArmy(ctx, 'TUR', ankara, { infantry: 10000 });
    const target = provinceByName(ctx.w, 'TUR', 'İzmir');
    expect(runCommand(ctx, { type: 'moveArmy', army: army.id, target }).ok).toBe(true);
    const steps = army.path.length;
    expect(steps).toBeGreaterThan(2);
    expect(pathTurns(ctx, army)).toBe(steps);
    advanceTurn(ctx);
    expect(ctx.s.armies[army.id].path.length).toBe(steps - 1);
    advanceTurn(ctx);
    expect(ctx.s.armies[army.id].path.length).toBe(steps - 2);
  });

  it('savunmasız düşman bölgesine giren ordu bölgeyi aynı turda ele geçirir', () => {
    const ctx = newModernGame();
    const [tp, sp] = borderPair(ctx, 'TUR', 'SYR');
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    for (const a of Object.values(ctx.s.armies)) if (a.location === sp) delete ctx.s.armies[a.id];
    const a = createArmy(ctx, 'TUR', tp, { infantry: 30000 });
    runCommand(ctx, { type: 'moveArmy', army: a.id, target: sp });
    advanceTurn(ctx);
    expect(ctx.s.armies[a.id].location).toBe(sp);
    expect(ctx.s.provinces[sp].controller).toBe('TUR');
    expect(ctx.s.provinces[sp].siege).toBeNull();
  });

  it('savunulan bölgede muharebe aynı turda sonuçlanır, kazanan bölgeyi alır', () => {
    const ctx = newModernGame();
    const [tp, sp] = borderPair(ctx, 'TUR', 'SYR');
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    for (const a of Object.values(ctx.s.armies)) if (a.location === sp) delete ctx.s.armies[a.id];
    const att = createArmy(ctx, 'TUR', tp, { infantry: 90000, artillery: 15000 }, { morale: 1 });
    const def = createArmy(ctx, 'SYR', sp, { infantry: 15000 }, { morale: 0.8 });
    const reports = ctx.s.battleReports.length;
    runCommand(ctx, { type: 'moveArmy', army: att.id, target: sp });
    advanceTurn(ctx);
    expect(Object.keys(ctx.s.battles)).toHaveLength(0);
    expect(ctx.s.battleReports.length).toBe(reports + 1);
    expect(armySoldiers(ctx.s.armies[att.id])).toBeLessThan(105000);
    const d = ctx.s.armies[def.id];
    expect(!d || d.location !== sp || d.path.length > 0).toBe(true);
    // Yenilen çekildiyse bölge aynı turda alınır; değilse en geç bir sonraki turda
    if (ctx.s.provinces[sp].controller !== 'TUR') advanceTurn(ctx);
    expect(ctx.s.provinces[sp].controller).toBe('TUR');
  });

  it('bütün toprakları ele geçirilen ve ordusu kalmayan ülke haritadan silinir', () => {
    const ctx = newModernGame();
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    for (const a of Object.values(ctx.s.armies)) if (a.owner === 'SYR') delete ctx.s.armies[a.id];
    invalidateArmies(ctx);
    for (const p of provincesOf(ctx, 'SYR')) ctx.s.provinces[p].controller = 'TUR';
    invalidateControl(ctx);
    advanceTurn(ctx);
    expect(ctx.s.countries.SYR.alive).toBe(false);
    expect(provincesOf(ctx, 'TUR').length).toBeGreaterThan(38);
  });
});
