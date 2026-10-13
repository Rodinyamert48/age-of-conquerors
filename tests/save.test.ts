import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { loadWorld, newModernGame } from './helpers';
import { advanceTurn, SAVE_VERSION } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { makeCtx } from '@/game/ctx';
import { deserialize, serializeState, SaveError } from '@/game/save';
import { deleteSave, listSaves, readSave, writeSave } from '@/lib/saves';
import { dateFromDay } from '@/game/calendar';

const json = (v: unknown) => JSON.stringify(v);

describe('kayıt sistemi', () => {
  it('kaydet/yükle tüm durumu eksiksiz geri getirir', () => {
    const ctx = newModernGame();
    runCommand(ctx, { type: 'declareWar', target: 'SYR' });
    for (let i = 0; i < 25; i++) advanceTurn(ctx);
    const text = JSON.stringify(serializeState(ctx.s));
    const loaded = deserialize(text, ctx.w.P);
    expect(loaded).toEqual(JSON.parse(json(ctx.s)));
    expect(loaded.rng).toBe(ctx.s.rng);
    expect(loaded.turn).toBe(ctx.s.turn);
    expect(Object.keys(loaded.wars).length).toBeGreaterThan(0);
  });

  it('yüklenen oyun aynı tohumla aynı şekilde devam eder (deterministik)', () => {
    const a = newModernGame({ seed: 99 });
    for (let i = 0; i < 20; i++) advanceTurn(a);
    const b = makeCtx(loadWorld(), deserialize(json(serializeState(a.s)), a.w.P));
    for (let i = 0; i < 30; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(json(b.s)).toBe(json(a.s));
  });

  it('aynı tohum aynı sonucu, farklı tohum farklı sonucu üretir', () => {
    const a = newModernGame({ seed: 5 });
    const b = newModernGame({ seed: 5 });
    const c = newModernGame({ seed: 6 });
    for (let i = 0; i < 40; i++) {
      advanceTurn(a);
      advanceTurn(b);
      advanceTurn(c);
    }
    // createdAt gerçek saat damgasıdır; simülasyonun parçası değildir
    const strip = (st: typeof a.s) => json({ ...st, meta: { ...st.meta, createdAt: 0 } });
    expect(strip(a.s)).toBe(strip(b.s));
    expect(c.s.rng).not.toBe(a.s.rng);
  });

  it('bozuk, uyumsuz ve eski kayıtlar doğru işlenir', () => {
    const ctx = newModernGame();
    expect(() => deserialize('{bozuk', ctx.w.P)).toThrow(SaveError);
    expect(() => deserialize({ foo: 1 }, ctx.w.P)).toThrow(/Eksik alan/);
    try {
      deserialize(json(ctx.s), ctx.w.P + 1);
      expect.unreachable();
    } catch (e) {
      expect((e as SaveError).code).toBe('world');
    }
    const newer = { ...JSON.parse(json(ctx.s)), saveVersion: SAVE_VERSION + 1 };
    expect(() => deserialize(newer, ctx.w.P)).toThrow(SaveError);
    // v0 kaydı (history alanı yok) taşınır
    const old = JSON.parse(json(ctx.s));
    delete old.history;
    old.saveVersion = 0;
    const migrated = deserialize(old, ctx.w.P);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.history).toEqual([]);
  });

  it('IndexedDB: oturum kaydı sayfa yenilemesinden sonra aynen okunur; yuvalar yönetilir', async () => {
    const ctx = newModernGame();
    for (let i = 0; i < 10; i++) advanceTurn(ctx);
    // Sayfa yenilemesi: oturum kaydı yazılır, sonra yeni bir "sayfa" onu okur
    await writeSave(ctx.s, 'session');
    const restored = await readSave('session', ctx.w.P);
    expect(json(restored)).toBe(json(ctx.s));
    // Oturum kaydının üzerine yazılır (tek yuva)
    advanceTurn(ctx);
    await writeSave(ctx.s, 'session');
    expect((await readSave('session', ctx.w.P)).turn).toBe(ctx.s.turn);
    // Otomatik kayıt: en fazla 3 döngüsel yuva
    for (let i = 0; i < 5; i++) {
      advanceTurn(ctx);
      await writeSave(ctx.s, 'auto');
      await new Promise((r) => setTimeout(r, 2));
    }
    const autos = (await listSaves()).filter((m) => m.kind === 'auto');
    expect(autos.length).toBe(3);
    expect(Math.max(...autos.map((m) => m.turn))).toBe(ctx.s.turn);
    // Elle kayıt + silme
    const meta = await writeSave(ctx.s, 'manual', 'Test kaydı');
    expect((await listSaves()).some((m) => m.id === meta.id && m.name === 'Test kaydı' && m.player === 'TUR')).toBe(true);
    await deleteSave(meta.id);
    expect((await listSaves()).some((m) => m.id === meta.id)).toBe(false);
    await expect(readSave(meta.id)).rejects.toThrow(SaveError);
  });
});

describe('zaman akışı', () => {
  it('günlük/haftalık/aylık adımlar tarihi doğru ilerletir; her tur bir kez işlenir', () => {
    const ctx = newModernGame();
    const d0 = ctx.s.day;
    advanceTurn(ctx);
    expect(ctx.s.day - d0).toBe(1);
    expect(ctx.s.turn).toBe(1);
    runCommand(ctx, { type: 'setTimeStep', step: 'week' });
    advanceTurn(ctx);
    expect(ctx.s.day - d0).toBe(8);
    runCommand(ctx, { type: 'setTimeStep', step: 'month' });
    const before = dateFromDay(ctx.s.day);
    advanceTurn(ctx);
    const after = dateFromDay(ctx.s.day);
    expect((after.y - before.y) * 12 + after.m - before.m).toBe(1);
    expect(ctx.s.turn).toBe(3);
  });

  it('haftalık adım, günlük adımlarla aynı hazine eğilimini verir (çift işleme yok)', () => {
    const a = newModernGame();
    const b = newModernGame();
    runCommand(b, { type: 'setTimeStep', step: 'week' });
    for (let i = 0; i < 14; i++) advanceTurn(a);
    for (let i = 0; i < 2; i++) advanceTurn(b);
    expect(b.s.day).toBe(a.s.day);
    const ta = a.s.countries.TUR.treasury;
    const tb = b.s.countries.TUR.treasury;
    expect(Math.abs(ta - tb) / Math.abs(ta)).toBeLessThan(0.05);
  });

  it('oyun bittiğinde tur ilerlemez', () => {
    const ctx = newModernGame();
    ctx.s.gameOver = { result: 'defeat', reason: 'test', day: ctx.s.day, acknowledged: false };
    const turn = ctx.s.turn;
    advanceTurn(ctx);
    expect(ctx.s.turn).toBe(turn);
  });
});
