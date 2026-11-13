import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { applyEffects } from '@/game/events';
import { getEventDef } from '@/game/data/events';
import { electionTick, holdElection, isDemocratic, electionWinChance } from '@/game/elections';
import { getMods } from '@/game/ctx';
import { declareWar } from '@/game/war';

describe('26.2 Faz 2 — afet ve salgın olayları', () => {
  it('salgın: karantina ekonomiyi, açık tutmak nüfusu vurur', () => {
    const ev = getEventDef('pandemic')!;
    expect(ev.options.length).toBe(3);
    const a = newModernGame({ player: 'TUR' });
    const t0 = getMods(a, 'TUR').tradeIncome;
    applyEffects(a, 'TUR', ev.options[0].effects);
    expect(getMods(a, 'TUR').tradeIncome).toBeLessThan(t0);
    const b = newModernGame({ player: 'TUR' });
    const g0 = getMods(b, 'TUR').popGrowth;
    applyEffects(b, 'TUR', ev.options[1].effects);
    expect(getMods(b, 'TUR').popGrowth).toBeLessThan(g0);
  });

  it('deprem, sel, kuraklık, kasırga, yangın ve iklim zirvesi tanımlı', () => {
    for (const id of ['earthquake', 'great_flood', 'drought', 'hurricane', 'wildfires', 'climate_summit']) {
      const ev = getEventDef(id);
      expect(ev, id).toBeDefined();
      expect(ev!.options.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('26.2 Faz 2 — seçimler', () => {
  it('demokratik ülkelerde seçim takvimi kurulur, diğerlerinde kurulmaz', () => {
    const ctx = newModernGame({ player: 'TUR' });
    electionTick(ctx);
    const demo = Object.values(ctx.s.countries).find((c) => c.alive && isDemocratic(c))!;
    const auto = Object.values(ctx.s.countries).find((c) => c.alive && !isDemocratic(c) && !c.rebelMovement && c.tag !== 'REB')!;
    expect(demo.nextElection).toBeGreaterThan(ctx.s.day);
    expect(auto.nextElection).toBeUndefined();
  });

  it('seçimi kaybeden oyuncunun kabinesi düşer ve politikaları değişir', () => {
    const ctx = newModernGame({ player: 'FRA' });
    const c = ctx.s.countries.FRA;
    expect(isDemocratic(c)).toBe(true);
    runCommand(ctx, { type: 'appointMinisters', picks: {} });
    expect(c.ministers).toBeDefined();
    const before = JSON.stringify(c.policies);
    expect(holdElection(ctx, c, false)).toBe(false);
    expect(c.ministers).toBeUndefined();
    expect(JSON.stringify(c.policies)).not.toBe(before);
    expect(c.lastElection?.won).toBe(false);
    expect(ctx.s.chronicle?.some((x) => x.key === 'notif.electionLost')).toBe(true);
    // Kazanınca kabine kalır
    runCommand(ctx, { type: 'appointMinisters', picks: {} });
    expect(holdElection(ctx, c, true)).toBe(true);
    expect(c.ministers).toBeDefined();
  });

  it('kampanya olayı seçimden önce oyuncuya sorulur ve vaatler şansı artırır', () => {
    const ctx = newModernGame({ player: 'FRA' });
    const c = ctx.s.countries.FRA;
    c.nextElection = ctx.s.day + 60;
    electionTick(ctx);
    const pe = ctx.s.pendingEvents.find((p) => p.eventId === 'election_campaign');
    expect(pe).toBeDefined();
    const p0 = electionWinChance(c);
    expect(runCommand(ctx, { type: 'resolveEvent', uid: pe!.uid, option: 1 } as never).ok).toBe(true);
    expect(electionWinChance(c)).toBeGreaterThan(p0);
  });
});

describe('26.2 Faz 2 — tarihçe', () => {
  it('savaş ilanı zaman çizelgesine yazılır', () => {
    const ctx = newModernGame({ player: 'TUR' });
    expect(declareWar(ctx, 'TUR', 'SYR')).toBeTruthy();
    expect(ctx.s.chronicle?.length).toBeGreaterThan(0);
  });

  it('seçimlerle birlikte on yıl hatasız ilerler', () => {
    const ctx = newModernGame({ player: 'FRA', timeStep: 'month' });
    for (let i = 0; i < 120; i++) advanceTurn(ctx);
    expect(Object.values(ctx.s.countries).some((c) => c.lastElection)).toBe(true);
  });
});
