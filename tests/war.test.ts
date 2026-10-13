import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { addTreatyIfMissing, performAction } from '@/game/diplomacy';
import { canDeclareWar, computeWarScore } from '@/game/war';
import { captureProvince } from '@/game/siege';
import { findTreaty, provincesOf } from '@/game/ctx';
import { atWar, relation } from '@/game/query';
import type { PeaceTerm, War } from '@/game/types';

function warWith(ctx: ReturnType<typeof newModernGame>, a: string, b: string): War {
  return Object.values(ctx.s.wars).find((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)))!;
}

describe('savaş, barış ve sahiplik', () => {
  it('işgal + barış antlaşması bölge sahipliğini değiştirir ve ateşkes kurar', () => {
    const ctx = newModernGame();
    expect(runCommand(ctx, { type: 'declareWar', target: 'SYR' }).ok).toBe(true);
    const war = warWith(ctx, 'TUR', 'SYR');
    const syr = provincesOf(ctx, 'SYR');
    const target = syr.find((p) => p !== ctx.s.countries.SYR.capital)!;
    // Suriye ordularını kaldırıp üç bölgeyi işgal et
    for (const a of Object.values(ctx.s.armies)) if (a.owner === 'SYR') delete ctx.s.armies[a.id];
    for (const p of syr.filter((p) => p !== ctx.s.countries.SYR.capital).slice(0, 3)) captureProvince(ctx, p, 'TUR');
    expect(ctx.s.provinces[target].controller).toBe('TUR');
    expect(computeWarScore(ctx, war)).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) advanceTurn(ctx);
    const terms: PeaceTerm[] = [{ type: 'province', province: target }];
    const r = runCommand(ctx, { type: 'proposePeace', war: war.id, target: 'SYR', beneficiary: 'TUR', terms });
    expect(r.ok).toBe(true);
    expect((r.data as { accepted: boolean }).accepted).toBe(true);
    expect(ctx.s.provinces[target].owner).toBe('TUR');
    expect(ctx.s.provinces[target].controller).toBe('TUR');
    expect(ctx.s.wars[war.id]).toBeUndefined();
    expect(atWar(ctx, 'TUR', 'SYR')).toBe(false);
    expect(findTreaty(ctx, 'truce', 'TUR', 'SYR')).toBeTruthy();
    // Barışta verilmeyen işgal edilmiş bölgeler sahibine döner
    for (const p of provincesOf(ctx, 'SYR')) expect(ctx.s.provinces[p].controller).toBe('SYR');
  });

  it('aşırı talepler reddedilir ve karşı teklif üretilebilir', () => {
    const ctx = newModernGame();
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    const war = warWith(ctx, 'TUR', 'SYR');
    const r = runCommand(ctx, { type: 'proposePeace', war: war.id, target: 'SYR', beneficiary: 'TUR', terms: [{ type: 'annex' }] });
    expect(r.ok).toBe(true);
    expect((r.data as { accepted: boolean }).accepted).toBe(false);
    expect(ctx.s.countries.SYR.alive).toBe(true);
    // Geçersiz koşul (kendi bölgesini talep etmek) komut düzeyinde reddedilir
    const own = ctx.s.countries.TUR.capital;
    expect(runCommand(ctx, { type: 'proposePeace', war: war.id, target: 'SYR', beneficiary: 'TUR', terms: [{ type: 'province', province: own }] }).error).toBe('peace.invalidTerms');
  });

  it('saldırmazlık paktı bozulursa itibar ve istikrar düşer, pakt kalkar', () => {
    const ctx = newModernGame();
    addTreatyIfMissing(ctx, 'nap', 'TUR', 'IRN', 10);
    const chk = canDeclareWar(ctx, 'TUR', 'IRN');
    expect(chk.ok).toBe(true);
    expect(chk.breaks.some((t) => t.type === 'nap')).toBe(true);
    const tur = ctx.s.countries.TUR;
    const rep0 = tur.reputation;
    const stab0 = tur.stability;
    expect(runCommand(ctx, { type: 'declareWar', target: 'IRN' }).ok).toBe(true);
    expect(tur.reputation).toBeLessThanOrEqual(rep0 - 25);
    expect(tur.stability).toBeLessThan(stab0);
    expect(findTreaty(ctx, 'nap', 'TUR', 'IRN')).toBeUndefined();
  });

  it('savunma paktı savaş ilanını engeller; ittifak üyeleri savunmaya katılır', () => {
    const ctx = newModernGame();
    addTreatyIfMissing(ctx, 'defensive', 'TUR', 'GEO', null);
    expect(runCommand(ctx, { type: 'declareWar', target: 'GEO' }).error).toBe('err.hasDefensivePact');
    // Ermenistan KGAÖ üyesi: Rusya ve diğer üyeler savunmaya otomatik katılır
    expect(runCommand(ctx, { type: 'declareWar', target: 'ARM' }).ok).toBe(true);
    const war = warWith(ctx, 'TUR', 'ARM');
    expect(war.defenders).toContain('RUS');
    expect(war.defenders).toContain('BLR');
  });

  it('haksız saldırı savaşına müttefikler kendiliğinden katılmaz', () => {
    const ctx = newModernGame();
    const r = runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    expect((r.data as { justified: boolean }).justified).toBe(false);
    const war = warWith(ctx, 'TUR', 'SYR');
    expect(war.justified).toBe(false);
    expect(war.attackers).toEqual(['TUR']);
  });

  it('diplomatik eylemler gerçek etki yaratır', () => {
    const ctx = newModernGame();
    const tur = ctx.s.countries.TUR;
    const rel0 = relation(ctx.s, 'TUR', 'GEO');
    const t0 = tur.treasury;
    const r = performAction(ctx, 'TUR', 'GEO', 'improve');
    expect(r.ok).toBe(true);
    expect(relation(ctx.s, 'TUR', 'GEO')).toBeGreaterThan(rel0);
    expect(tur.treasury).toBeLessThan(t0);
    // Ticaret anlaşması gelir hesabını etkiler
    const trade0 = ctx.s.countries.GEO.budget.trade;
    addTreatyIfMissing(ctx, 'trade', 'GEO', 'CHN', null);
    runCommand(ctx, { type: 'setTimeStep', step: 'day' }); // bütçeleri yeniden hesaplatır
    expect(ctx.s.countries.GEO.budget.trade).toBeGreaterThan(trade0);
  });

  it('ateşkes süresince savaş ilanı ağır ceza getirir', () => {
    const ctx = newModernGame();
    addTreatyIfMissing(ctx, 'truce', 'TUR', 'IRN', 5);
    const chk = canDeclareWar(ctx, 'TUR', 'IRN');
    expect(chk.breaks.some((t) => t.type === 'truce')).toBe(true);
    const rep0 = ctx.s.countries.TUR.reputation;
    runCommand(ctx, { type: 'declareWar', target: 'IRN' });
    expect(ctx.s.countries.TUR.reputation).toBeLessThanOrEqual(rep0 - 30);
  });
});
