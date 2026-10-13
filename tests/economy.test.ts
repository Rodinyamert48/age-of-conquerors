import { describe, it, expect } from 'vitest';
import { newModernGame, provinceByName } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { computeAllBudgets, economyTick } from '@/game/economy';
import { buildingAvailability } from '@/game/construction';
import { stabilityTarget } from '@/game/stability';
import { DAYS_PER_MONTH } from '@/game/balance';
import { RESOURCE_IDS, BUILDING_IDS } from '@/game/types';
import type { Budget } from '@/game/types';

const INCOME: (keyof Budget)[] = ['tax', 'trade', 'production', 'exports', 'tributeIn', 'reparationsIn'];
const EXPENSES: (keyof Budget)[] = ['armyUpkeep', 'navyUpkeep', 'fortUpkeep', 'war', 'policies', 'imports', 'interest', 'tributeOut', 'reparationsOut'];
const sum = (b: Budget, keys: (keyof Budget)[]) => keys.reduce((a, k) => a + b[k], 0);

describe('ekonomi', () => {
  it('bütçe kalemleri toplamlarla tutarlıdır (tüm ülkeler)', () => {
    const ctx = newModernGame();
    for (let i = 0; i < 40; i++) advanceTurn(ctx);
    computeAllBudgets(ctx);
    let checked = 0;
    for (const c of Object.values(ctx.s.countries)) {
      if (!c.alive || c.tag === 'REB') continue;
      const b = c.budget;
      for (const [k, v] of Object.entries(b)) {
        expect(Number.isFinite(v), `${c.tag}.${k}`).toBe(true);
        if (k !== 'balance') expect(v, `${c.tag}.${k} negatif`).toBeGreaterThanOrEqual(0);
      }
      expect(b.income).toBeCloseTo(sum(b, INCOME), 6);
      expect(b.expenses).toBeCloseTo(sum(b, EXPENSES), 6);
      expect(b.balance).toBeCloseTo(b.income - b.expenses, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('günlük ekonomi güncellemesi hazineye aylık bakiyenin 1/30’unu yansıtır', () => {
    const ctx = newModernGame();
    const tur = ctx.s.countries.TUR;
    const before = tur.treasury;
    economyTick(ctx, 1, false);
    expect(tur.treasury - before).toBeCloseTo(tur.budget.balance / DAYS_PER_MONTH, 9);
    const b2 = tur.treasury;
    economyTick(ctx, 7, false);
    expect(tur.treasury - b2).toBeCloseTo((tur.budget.balance * 7) / DAYS_PER_MONTH, 9);
  });

  it('ay sonunda kaynak stokları üretim/tüketim/ticarete göre güncellenir', () => {
    const ctx = newModernGame();
    const led = ctx.s.countries.TUR.resources;
    const expected = Object.fromEntries(
      RESOURCE_IDS.map((k) => [k, Math.max(0, led.stock[k] + led.production[k] - led.consumption[k] + led.imported[k] - led.exported[k])]),
    );
    economyTick(ctx, 1, true);
    for (const k of RESOURCE_IDS) expect(ctx.s.countries.TUR.resources.stock[k]).toBeCloseTo(expected[k], 6);
  });

  it('vergi artışı geliri artırır, istikrar hedefini düşürür', () => {
    const ctx = newModernGame();
    const tur = ctx.s.countries.TUR;
    const tax0 = tur.budget.tax;
    const stab0 = stabilityTarget(ctx, tur).target;
    const level = tur.policies.tax;
    const r = runCommand(ctx, { type: 'setPolicy', policy: 'tax', level: Math.min(4, level + 2) });
    expect(r.ok).toBe(true);
    expect(tur.budget.tax).toBeGreaterThan(tax0);
    expect(stabilityTarget(ctx, tur).target).toBeLessThan(stab0);
    // Geçersiz seviye reddedilir
    expect(runCommand(ctx, { type: 'setPolicy', policy: 'tax', level: 9 }).ok).toBe(false);
  });

  it('inşaat maliyeti hazineden düşülür, süre sonunda bina seviyesi artar', () => {
    const ctx = newModernGame();
    const tur = ctx.s.countries.TUR;
    const konya = provinceByName(ctx.w, 'TUR', 'Konya');
    const idx = BUILDING_IDS.indexOf('agriculture');
    const lvl0 = ctx.s.provinces[konya].buildings[idx];
    const av = buildingAvailability(ctx, 'TUR', konya, 'agriculture');
    expect(av.ok).toBe(true);
    const t0 = tur.treasury;
    const r = runCommand(ctx, { type: 'build', province: konya, building: 'agriculture' });
    expect(r.ok).toBe(true);
    expect(t0 - tur.treasury).toBeCloseTo(av.cost, 6);
    expect(tur.budget.construction).toBeCloseTo(av.cost, 6);
    // Aynı bölgede ikinci inşaat engellenir
    expect(runCommand(ctx, { type: 'build', province: konya, building: 'industry' }).ok).toBe(false);
    for (let i = 0; i < av.days + 1; i++) advanceTurn(ctx);
    expect(ctx.s.provinces[konya].buildings[idx]).toBe(lvl0 + 1);
    expect(ctx.s.provinces[konya].construction).toBeNull();
  });

  it('arazi kısıtları uygulanır: kıyısı olmayan bölgeye liman yapılamaz', () => {
    const ctx = newModernGame();
    const konya = provinceByName(ctx.w, 'TUR', 'Konya');
    expect(ctx.w.coastal[konya]).toBeFalsy();
    const r = runCommand(ctx, { type: 'build', province: konya, building: 'port' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('build.needsCoast');
    // Başkasının bölgesine inşaat yapılamaz
    const sofya = provinceByName(ctx.w, 'BGR', 'Sofya');
    expect(runCommand(ctx, { type: 'build', province: sofya, building: 'agriculture' }).error).toBe('build.notOwned');
  });

  it('asker toplama para ve insan gücü harcar, süre sonunda ordu oluşur', () => {
    const ctx = newModernGame();
    const tur = ctx.s.countries.TUR;
    const konya = provinceByName(ctx.w, 'TUR', 'Konya');
    const mp0 = tur.manpower;
    const t0 = tur.treasury;
    const armies0 = Object.values(ctx.s.armies).filter((a) => a.owner === 'TUR' && a.location === konya).length;
    const r = runCommand(ctx, { type: 'recruit', province: konya, unit: 'infantry', amount: 5000 });
    expect(r.ok).toBe(true);
    expect(tur.treasury).toBeLessThan(t0);
    expect(tur.manpower).toBeCloseTo(mp0 - 5000, 0);
    const job = ctx.s.provinces[konya].recruits[0];
    expect(job).toBeTruthy();
    const days = Math.ceil(job.daysLeft);
    for (let i = 0; i < days + 1; i++) advanceTurn(ctx);
    const here = Object.values(ctx.s.armies).filter((a) => a.owner === 'TUR' && a.location === konya);
    expect(here.length).toBeGreaterThan(armies0);
    expect(here.some((a) => a.units.infantry >= 5000)).toBe(true);
  });
});
