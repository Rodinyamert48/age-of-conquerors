import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand, runCommandAs, setHumans } from '@/game/commands';
import { MINISTER_ROLES, ministersDue, ministerCandidates, MINISTER_TERM_YEARS } from '@/game/ministers';
import { getMods } from '@/game/ctx';
import { leaderOf } from '@/game/data/leaders';

describe('Faz 2 — bakanlar', () => {
  it('oyun başında oyuncunun ataması gerekir; yapay zekâ ilk turda atanır', () => {
    const ctx = newModernGame();
    expect(ministersDue(ctx, ctx.s.player)).toBe(true);
    expect(ctx.s.countries.DEU.ministers).toBeUndefined();
    advanceTurn(ctx);
    expect(ctx.s.countries.DEU.ministers).toBeDefined();
    expect(Object.keys(ctx.s.countries.DEU.ministers!)).toHaveLength(MINISTER_ROLES.length);
  });

  it('atama kalıcı olur, etki modifikatörlerine yansır ve 5 yıl sonra yenilenir', () => {
    const ctx = newModernGame();
    const tag = ctx.s.player;
    const before = JSON.stringify(getMods(ctx, tag));
    expect(runCommand(ctx, { type: 'appointMinisters', picks: { interior: 1, finance: 2 } }).ok).toBe(true);
    const c = ctx.s.countries[tag];
    expect(c.ministers!.interior!.trait).toBe(ministerCandidates(tag, 'interior', 1)[1].trait);
    expect(JSON.stringify(getMods(ctx, tag))).not.toBe(before);
    expect(ministersDue(ctx, tag)).toBe(false);
    ctx.s.day += Math.round(MINISTER_TERM_YEARS * 365.25) + 1;
    expect(ministersDue(ctx, tag)).toBe(true);
  });

  it('her bakanın bir artısı ve bir eksisi vardır', () => {
    for (const role of MINISTER_ROLES) {
      for (const cand of ministerCandidates('TUR', role, 1)) expect(cand.trait).toBeTruthy();
    }
  });

  it('2020 liderleri bilinen ülkeler için tanımlı', () => {
    expect(leaderOf('TUR')?.name).toBeTruthy();
    expect(leaderOf('USA')?.name).toBeTruthy();
  });
});

describe('Faz 2 — çevrimiçi mod mantığı', () => {
  it('konuk komutu kendi ülkesi adına çalışır; yetkisiz işlem reddedilir', () => {
    const ctx = newModernGame({ player: 'TUR' });
    setHumans(ctx, ['DEU']);
    expect(ctx.s.humans).toEqual(['TUR', 'DEU']);
    expect(ctx.s.countries.DEU.isPlayer).toBe(true);
    const r = runCommandAs(ctx, 'DEU', { type: 'appointMinisters', picks: {} });
    expect(r.ok).toBe(true);
    expect(ctx.s.countries.DEU.ministers).toBeDefined();
    expect(ctx.s.countries.TUR.ministers).toBeUndefined();
    expect(ctx.s.player).toBe('TUR');
    // insan olmayan ülke adına komut yok
    expect(runCommandAs(ctx, 'FRA', { type: 'appointMinisters', picks: {} }).ok).toBe(false);
    // yönetici komutu çevrimiçi konuğa kapalı
    expect(runCommandAs(ctx, 'DEU', { type: 'admin', op: { kind: 'research' } } as never).ok).toBe(false);
  });

  it('insan oyuncular yapay zekâ tarafından yönetilmez; ayrılınca yeniden yönetilir', () => {
    const ctx = newModernGame({ player: 'TUR' });
    setHumans(ctx, ['DEU']);
    for (let i = 0; i < 3; i++) advanceTurn(ctx);
    expect(ctx.s.countries.DEU.ministers).toBeUndefined();
    setHumans(ctx, []);
    expect(ctx.s.countries.DEU.isPlayer).toBe(false);
    advanceTurn(ctx);
    expect(ctx.s.countries.DEU.ministers).toBeDefined();
  });
});
