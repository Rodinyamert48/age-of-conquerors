import { describe, it, expect } from 'vitest';
import { loadWorld, newModernGame, provinceByName } from './helpers';
import { advanceTurn, createGame } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { transferProvince } from '@/game/war';
import { allianceOf, provincesOf } from '@/game/ctx';
import { victoryProgress } from '@/game/victory';
import { dateFromDay } from '@/game/calendar';
import { SCENARIOS } from '@/game/scenarios';
import { totalPop } from '@/game/query';

describe('yapay zekâ', () => {
  it('barışta ülkeler araştırma seçer, inşaat yapar ve asker toplar', () => {
    const ctx = newModernGame();
    for (let i = 0; i < 90; i++) advanceTurn(ctx);
    const ai = Object.values(ctx.s.countries).filter((c) => c.alive && !c.isPlayer && c.tag !== 'REB');
    const researching = ai.filter((c) => c.research.current || c.techs.length > 0).length;
    expect(researching / ai.length).toBeGreaterThan(0.8);
    const builders = new Set(ctx.s.provinces.filter((p) => p.construction && p.owner !== 'TUR').map((p) => p.owner));
    expect(builders.size).toBeGreaterThan(20);
    const notes = ctx.s.notifications.length;
    expect(notes).toBeGreaterThan(0);
  });

  it('saldırıya uğrayan yapay zekâ ordularını harekete geçirir', () => {
    const ctx = newModernGame();
    expect(runCommand(ctx, { type: 'declareWar', target: 'SYR' }).ok).toBe(true);
    const start = new Map(Object.values(ctx.s.armies).filter((a) => a.owner === 'SYR').map((a) => [a.id, a.location]));
    for (let i = 0; i < 30; i++) advanceTurn(ctx);
    const syr = Object.values(ctx.s.armies).filter((a) => a.owner === 'SYR');
    const moved = syr.filter((a) => start.get(a.id) !== a.location || a.path.length > 0 || a.battle).length;
    const turkishControlled = provincesOf(ctx, 'TUR').filter((p) => ctx.s.provinces[p].controller !== 'TUR').length;
    expect(moved + turkishControlled + ctx.s.battleReports.length).toBeGreaterThan(0);
  });

  it('zorluk yapay zekânın karar sıklığını değiştirir', () => {
    const w = loadWorld();
    const base = { scenarioId: 'modern', player: 'TUR', timeStep: 'day' as const, victory: { mode: 'sandbox' as const, target: 0 }, seed: 1 };
    const easy = createGame(w, { ...base, difficulty: 'easy' });
    const hard = createGame(w, { ...base, difficulty: 'hard' });
    // Ortalama "bir sonraki düşünme" aralığı: zor seviyede belirgin şekilde kısa
    const avgGap = (ctx: typeof easy) => {
      const ai = Object.values(ctx.s.countries).filter((c) => c.alive && !c.isPlayer && c.tag !== 'REB');
      return ai.reduce((a, c) => a + (c.ai.nextThink - ctx.s.day), 0) / ai.length;
    };
    for (let i = 0; i < 30; i++) {
      advanceTurn(easy);
      advanceTurn(hard);
    }
    expect(avgGap(hard)).toBeLessThan(avgGap(easy));
  });
});

describe('zafer ve yenilgi', () => {
  it('oyuncu tüm topraklarını kaybederse yenilgi algılanır ve komutlar kilitlenir', () => {
    const ctx = newModernGame();
    for (const p of [...provincesOf(ctx, 'TUR')]) transferProvince(ctx, p, 'GRC');
    advanceTurn(ctx);
    expect(ctx.s.countries.TUR.alive).toBe(false);
    expect(ctx.s.gameOver?.result).toBe('defeat');
    expect(runCommand(ctx, { type: 'setResearch', tech: null }).error).toBe('err.gameOver');
    // Başka bir ülkeyle devam edilebilir
    expect(runCommand(ctx, { type: 'switchCountry', tag: 'GRC' }).ok).toBe(true);
    expect(ctx.s.player).toBe('GRC');
    expect(ctx.s.gameOver).toBeNull();
  });

  it('bölge hedefi tamamlanınca zafer algılanır', () => {
    const ctx = newModernGame({ victory: { mode: 'provinces', target: 39 } });
    expect(provincesOf(ctx, 'TUR').length).toBe(38);
    advanceTurn(ctx);
    expect(ctx.s.gameOver).toBeNull();
    expect(victoryProgress(ctx).progress).toBeCloseTo(38 / 39, 5);
    const halep = provinceByName(ctx.w, 'SYR', 'Halep');
    transferProvince(ctx, halep, 'TUR');
    advanceTurn(ctx);
    expect(ctx.s.gameOver?.result).toBe('victory');
    // Onaydan sonra serbest oyun sürer
    expect(runCommand(ctx, { type: 'acknowledgeGameOver' }).ok).toBe(true);
    const t = ctx.s.turn;
    advanceTurn(ctx);
    expect(ctx.s.turn).toBe(t + 1);
  });

  it('başkent kaybında başkent taşınır, ülke yaşamaya devam eder', () => {
    const ctx = newModernGame();
    const cap = ctx.s.countries.SYR.capital;
    transferProvince(ctx, cap, 'TUR');
    const syr = ctx.s.countries.SYR;
    expect(syr.capital).not.toBe(cap);
    expect(ctx.s.provinces[syr.capital].owner).toBe('SYR');
    advanceTurn(ctx);
    expect(syr.alive).toBe(true);
  });
});

describe('senaryo başlangıç verisi', () => {
  it('modern senaryo gerçek başlangıç durumunu kurar', () => {
    const ctx = newModernGame();
    const s = ctx.s;
    const d = dateFromDay(s.day);
    expect([d.y, d.m, d.d]).toEqual([2020, 1, 1]);
    const tur = s.countries.TUR;
    expect(ctx.w.data.provinces[tur.capital].name).toBe('Ankara');
    expect(totalPop(ctx, 'TUR')).toBeGreaterThan(75e6);
    expect(totalPop(ctx, 'TUR')).toBeLessThan(92e6);
    expect(ctx.w.data.provinces[s.countries.USA.capital].a3).toBe('USA');
    const nato = allianceOf(ctx, 'USA')!;
    expect(nato.members).toContain('TUR');
    expect(nato.members.length).toBe(29);
    expect(allianceOf(ctx, 'RUS')!.members).toContain('ARM');
    for (const c of Object.values(s.countries)) {
      if (!c.alive || c.tag === 'REB') continue;
      expect(s.provinces[c.capital]?.owner, `${c.tag} başkenti`).toBe(c.tag);
    }
    for (const p of s.provinces) expect(s.countries[p.owner], `sahip ${p.owner}`).toBeTruthy();
    for (const a of Object.values(s.armies)) {
      expect(a.location).toBeGreaterThanOrEqual(0);
      expect(a.location).toBeLessThan(ctx.w.N);
    }
    for (const v of Object.values(s.relations)) {
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(Object.values(s.countries).filter((c) => c.alive).length).toBeGreaterThan(150);
  });

  it('veri doğrulanmamış senaryolar başlatılamaz olarak işaretlidir', () => {
    const modern = SCENARIOS.find((x) => x.id === 'modern')!;
    expect(modern.available).toBe(true);
    for (const sc of SCENARIOS.filter((x) => !x.available)) expect(sc.status?.tr).toBeTruthy();
  });
});
