import { describe, it, expect } from 'vitest';
import { newModernGame, provinceByName } from './helpers';
import { runCommand } from '@/game/commands';
import { armiesAt } from '@/game/ctx';
import { armySoldiers } from '@/game/query';
import { TECHS } from '@/game/defs/techs';

describe('yönetici menüsü', () => {
  it('istatistikleri ayarlar ve sınırlar içinde tutar', () => {
    const ctx = newModernGame();
    runCommand(ctx, { type: 'admin', op: { kind: 'stat', tag: 'TUR', stat: 'treasury', value: 5000, add: true } });
    expect(ctx.s.countries.TUR.treasury).toBeGreaterThan(5000);
    runCommand(ctx, { type: 'admin', op: { kind: 'stat', tag: 'TUR', stat: 'stability', value: 500 } });
    expect(ctx.s.countries.TUR.stability).toBe(100);
  });

  it('eyalet ekonomisini ve teknolojiyi artırır', () => {
    const ctx = newModernGame();
    const p = provinceByName(ctx.w, 'TUR', 'Konya');
    const out = ctx.s.provinces[p].output;
    runCommand(ctx, { type: 'admin', op: { kind: 'province', province: p, what: 'output' } });
    expect(ctx.s.provinces[p].output).toBeCloseTo(out * 1.5);
    runCommand(ctx, { type: 'admin', op: { kind: 'techs', tag: 'TUR', mode: 'all' } });
    expect(ctx.s.countries.TUR.techs.length).toBe(TECHS.length);
  });

  it('orduları siler, oluşturur ve başka devletin ordusunu değiştirir', () => {
    const ctx = newModernGame();
    const p = provinceByName(ctx.w, 'TUR', 'Ankara');
    runCommand(ctx, { type: 'admin', op: { kind: 'clearArmies', province: p } });
    expect(armiesAt(ctx, p)).toHaveLength(0);
    runCommand(ctx, { type: 'admin', op: { kind: 'spawnArmy', province: p, owner: 'GRC', unit: 'infantry', amount: 12000 } });
    const a = armiesAt(ctx, p)[0];
    expect(a.owner).toBe('GRC');
    expect(armySoldiers(a)).toBe(12000);
    runCommand(ctx, { type: 'admin', op: { kind: 'setArmyOwner', army: a.id, owner: 'TUR' } });
    expect(ctx.s.armies[a.id].owner).toBe('TUR');
    // Deniz birliği karada oluşturulamaz
    expect(runCommand(ctx, { type: 'admin', op: { kind: 'spawnArmy', province: p, owner: 'TUR', unit: 'navy', amount: 3 } }).ok).toBe(false);
  });

  it('eyaletin sahibini değiştirir', () => {
    const ctx = newModernGame();
    const p = provinceByName(ctx.w, 'SYR', 'Halep');
    runCommand(ctx, { type: 'admin', op: { kind: 'setOwner', province: p, owner: 'TUR' } });
    expect(ctx.s.provinces[p].owner).toBe('TUR');
    expect(ctx.s.provinces[p].controller).toBe('TUR');
  });
});
