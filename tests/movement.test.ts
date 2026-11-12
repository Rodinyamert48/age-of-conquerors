import { describe, it, expect } from 'vitest';
import { newModernGame, provinceByName } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { createArmy } from '@/game/construction';
import { findPath, hasPortAt } from '@/game/movement';
import { addTreatyIfMissing } from '@/game/diplomacy';
import { landNeighbors } from '@/game/world';
import { detectBattles } from '@/game/combat';
import { armiesOf, provincesOf } from '@/game/ctx';
import type { Ctx } from '@/game/ctx';

function hasEdge(ctx: Ctx, a: number, b: number) {
  const w = ctx.w;
  for (let e = w.edgeStart[a]; e < w.edgeStart[a + 1]; e++) if (w.edgeTo[e] === b) return true;
  return false;
}

function borderPair(ctx: Ctx, from: string, to: string): [number, number] {
  for (let p = 0; p < ctx.w.P; p++) {
    if (ctx.s.provinces[p].owner !== from) continue;
    const n = landNeighbors(ctx.w, p).find((q) => ctx.s.provinces[q].owner === to);
    if (n !== undefined) return [p, n];
  }
  throw new Error(`${from}-${to} sınırı yok`);
}

describe('hareket ve rota', () => {
  it('rotalar yalnızca geçerli komşuluklardan oluşur', () => {
    const ctx = newModernGame();
    const ankara = provinceByName(ctx.w, 'TUR', 'Ankara');
    const izmir = provinceByName(ctx.w, 'TUR', 'İzmir');
    const army = createArmy(ctx, 'TUR', ankara, { infantry: 10000 });
    const res = findPath(ctx, army, izmir);
    expect(res).not.toBeNull();
    expect(res!.days).toBeGreaterThan(0);
    let cur = ankara;
    for (const n of res!.path) {
      expect(hasEdge(ctx, cur, n), `${cur}→${n}`).toBe(true);
      expect(n).toBeLessThan(ctx.w.P); // kara rotası denize sapmaz
      cur = n;
    }
    expect(cur).toBe(izmir);
  });

  it('hareket emri ordu konumunu süre sonunda hedefe taşır', () => {
    const ctx = newModernGame();
    const ankara = provinceByName(ctx.w, 'TUR', 'Ankara');
    const konya = provinceByName(ctx.w, 'TUR', 'Konya');
    const army = armiesOf(ctx, 'TUR').find((a) => a.location === ankara && !a.isNavy)!;
    const r = runCommand(ctx, { type: 'moveArmy', army: army.id, target: konya });
    expect(r.ok).toBe(true);
    const days = Math.ceil((r.data as { days: number }).days);
    for (let i = 0; i < days + 1; i++) advanceTurn(ctx);
    expect(ctx.s.armies[army.id].location).toBe(konya);
    expect(ctx.s.armies[army.id].path).toEqual([]);
  });

  it('geçersiz hareketler engellenir', () => {
    const ctx = newModernGame();
    const ankara = provinceByName(ctx.w, 'TUR', 'Ankara');
    const army = armiesOf(ctx, 'TUR').find((a) => a.location === ankara && !a.isNavy)!;
    // Deniz düğümü hedef alınamaz
    expect(runCommand(ctx, { type: 'moveArmy', army: army.id, target: ctx.w.P + 5 }).error).toBe('move.landToSea');
    // Sınır dışı düğüm
    expect(runCommand(ctx, { type: 'moveArmy', army: army.id, target: ctx.w.N + 10 }).error).toBe('err.invalidTarget');
    // Başka ülkenin ordusu yönetilemez
    const greek = armiesOf(ctx, 'GRC')[0];
    expect(runCommand(ctx, { type: 'moveArmy', army: greek.id, target: ankara }).error).toBe('err.notFound');
    // Geçiş izni olmayan tarafsız ülkeye girilemez
    const tiflis = provinceByName(ctx.w, 'GEO', 'Tiflis');
    expect(runCommand(ctx, { type: 'moveArmy', army: army.id, target: tiflis }).error).toBe('move.noPath');
  });

  it('geçiş izni antlaşması tarafsız topraklardan geçişe izin verir', () => {
    const ctx = newModernGame();
    const [border] = borderPair(ctx, 'TUR', 'GEO');
    const tiflis = provinceByName(ctx.w, 'GEO', 'Tiflis');
    const army = createArmy(ctx, 'TUR', border, { infantry: 10000 });
    expect(findPath(ctx, army, tiflis)).toBeNull();
    addTreatyIfMissing(ctx, 'access', 'GEO', 'TUR', 5);
    expect(findPath(ctx, army, tiflis)).not.toBeNull();
    expect(runCommand(ctx, { type: 'moveArmy', army: army.id, target: tiflis }).ok).toBe(true);
  });

  it('denize yalnızca kendi limanından açılınır; liman yoksa rota reddedilir', () => {
    const ctx = newModernGame();
    const izmir = provinceByName(ctx.w, 'TUR', 'İzmir');
    const iceland = ctx.s.provinces.findIndex((ps) => ps.owner === 'ISL');
    const army = createArmy(ctx, 'TUR', izmir, { infantry: 20000 });
    // Limansız: ada hedefine gidilemez
    for (const p of provincesOf(ctx, 'TUR')) ctx.s.provinces[p].buildings[3] = 0;
    expect(hasPortAt(ctx, 'TUR', izmir)).toBe(false);
    expect(findPath(ctx, army, iceland)).toBeNull();
    const r0 = runCommand(ctx, { type: 'moveArmy', army: army.id, target: iceland });
    expect(r0.ok).toBe(false);
    expect(r0.error).toBe('move.needsPort');
    // Limanlı: rota denizden geçer
    ctx.s.provinces[izmir].buildings[3] = 1;
    expect(hasPortAt(ctx, 'TUR', izmir)).toBe(true);
    const r1 = runCommand(ctx, { type: 'moveArmy', army: army.id, target: iceland });
    expect(r1.ok).toBe(true);
    expect(army.path.some((n) => n >= ctx.w.P)).toBe(true);
    // Düşman kontrolündeki liman kullanılamaz
    ctx.s.provinces[izmir].controller = 'GRC';
    expect(hasPortAt(ctx, 'TUR', izmir)).toBe(false);
  });

  it('düşman ordusuyla aynı bölgede savaş halinde hareket emri verilemez', () => {
    const ctx = newModernGame();
    const [tp, sp] = borderPair(ctx, 'TUR', 'SYR');
    expect(runCommand(ctx, { type: 'declareWar', target: 'SYR' }).ok).toBe(true);
    const a = createArmy(ctx, 'TUR', sp, { infantry: 20000 });
    createArmy(ctx, 'SYR', sp, { infantry: 20000 });
    detectBattles(ctx);
    expect(ctx.s.armies[a.id].battle).toBeTruthy();
    expect(runCommand(ctx, { type: 'moveArmy', army: a.id, target: tp }).error).toBe('err.inBattle');
  });
});
