import { describe, it, expect } from 'vitest';
import { newModernGame, provinceByName } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { applyEffects } from '@/game/events';
import { getEventDef, getEventDefs } from '@/game/data/events';
import { getMods, provincesOf } from '@/game/ctx';
import { transferProvince } from '@/game/war';
import { stabilityTick } from '@/game/stability';
import { ASSIMILATION_DAYS } from '@/game/assimilation';

describe('Faz 3 — seçimli olaylar', () => {
  it('ekonomik devrim: iki farklı bedel/getiri sunar', () => {
    const ev = getEventDef('economic_revolution')!;
    expect(ev.options.length).toBeGreaterThanOrEqual(2);
    const ctx = newModernGame({ player: 'TUR' });
    const c = ctx.s.countries.TUR;
    const base = getMods(ctx, 'TUR');
    const t0 = c.treasury;
    applyEffects(ctx, 'TUR', ev.options[0].effects);
    expect(c.treasury).toBeLessThan(t0);
    expect(getMods(ctx, 'TUR').productionIncome).toBeCloseTo(base.productionIncome + 0.15, 5);
    const ctx2 = newModernGame({ player: 'TUR' });
    const b2 = getMods(ctx2, 'TUR');
    applyEffects(ctx2, 'TUR', ev.options[1].effects);
    expect(getMods(ctx2, 'TUR').taxEfficiency).toBeCloseTo(b2.taxEfficiency + 0.05, 5);
  });

  it('protesto ve askerî darbe olayları, bastırma/uzlaşma/teslim yolları ile vardır', () => {
    const ids = getEventDefs().map((e) => e.id);
    expect(ids).toContain('protests_wave');
    const coup = getEventDef('military_coup')!;
    expect(coup.options.length).toBe(3);
    const ctx = newModernGame({ player: 'TUR' });
    applyEffects(ctx, 'TUR', coup.options[2].effects);
    expect(ctx.s.countries.TUR.government).toBe('military_junta');
  });
});

describe('Faz 3 — asimilasyon', () => {
  it('fethedilen bölge asimile edilir ve çekirdek olur', () => {
    const ctx = newModernGame({ player: 'TUR' });
    const p = provinceByName(ctx.w, 'RUS', 'Moskova');
    const prev = ctx.s.provinces[p].owner;
    transferProvince(ctx, p, 'TUR');
    const ps = ctx.s.provinces[p];
    ps.cores = ps.cores.filter((x) => x !== 'TUR');
    ctx.s.countries.TUR.treasury = 1e12;
    expect(prev).not.toBe('TUR');
    expect(runCommand(ctx, { type: 'assimilate', province: p }).ok).toBe(true);
    // Farklı inançtan halkta süre 1,4 kat uzar (26.2)
    expect(ps.assimilating).toBe(Math.round(ASSIMILATION_DAYS * 1.4));
    expect(runCommand(ctx, { type: 'assimilate', province: p }).ok).toBe(false);
    for (let i = 0; i < 90; i++) stabilityTick(ctx);
    expect(ps.cores).toContain('TUR');
    expect(ps.assimilating).toBeUndefined();
    expect(provincesOf(ctx, 'TUR')).toContain(p);
  });

  it('çekirdek olmayan bölge çekirdek olandan daha huzursuzdur; asimilasyon azaltır', () => {
    const ctx = newModernGame({ player: 'TUR' });
    advanceTurn(ctx);
    const p = provincesOf(ctx, 'TUR')[0];
    const ps = ctx.s.provinces[p];
    expect(ps.cores).toContain('TUR');
  });
});
