import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { advanceTurn } from '@/game/engine';
import { runCommand } from '@/game/commands';
import { applyPeace, casusBelli, conferenceDemands, declareWar, joinWar } from '@/game/war';
import { computeAllBudgets } from '@/game/economy';
import { hasEmbargo, performAction } from '@/game/diplomacy';
import { addGrievance, hasIntel, spyOperation } from '@/game/espionage';
import { MINISTER_ROLES } from '@/game/ministers';
import { captureProvince } from '@/game/siege';
import { invalidateDiplomacy, provincesOf, type Ctx } from '@/game/ctx';

function neutral(ctx: Ctx) {
  ctx.s.alliances = {};
  ctx.s.treaties = [];
  for (const k of Object.keys(ctx.s.relations)) ctx.s.relations[k] = 0;
  invalidateDiplomacy(ctx);
}

describe('26.2 Faz 1 — casusluk', () => {
  it('ajan gönderilir, ağ büyür, %30 üstünde istihbarat açılır', () => {
    const ctx = newModernGame({ player: 'TUR' });
    ctx.s.countries.TUR.treasury = 1e9;
    expect(hasIntel(ctx, 'TUR', 'GRC')).toBe(false);
    expect(runCommand(ctx, { type: 'spy', op: 'infiltrate', target: 'GRC' }).ok).toBe(true);
    expect(ctx.s.countries.TUR.spies!.GRC).toBe(20);
    expect(runCommand(ctx, { type: 'spy', op: 'sabotage', target: 'GRC' }).error).toBe('spy.networkTooWeak');
    ctx.s.countries.TUR.spies!.GRC = 35;
    expect(hasIntel(ctx, 'TUR', 'GRC')).toBe(true);
  });

  it('sabotaj ve ayaklanma hedefe zarar verir ya da yakalanınca savaş gerekçesi doğurur', () => {
    const ctx = newModernGame({ player: 'TUR' });
    ctx.s.countries.TUR.treasury = 1e9;
    let incited = false;
    let caught = false;
    for (let i = 0; i < 40 && !(incited && caught); i++) {
      ctx.s.countries.TUR.spies = { GRC: 60 };
      for (const p of provincesOf(ctx, 'GRC')) ctx.s.provinces[p].unrest = 0;
      const before = provincesOf(ctx, 'GRC').reduce((a, p) => a + ctx.s.provinces[p].unrest, 0);
      const r = spyOperation(ctx, 'TUR', 'GRC', 'incite');
      expect(r.ok).toBe(true);
      const after = provincesOf(ctx, 'GRC').reduce((a, p) => a + ctx.s.provinces[p].unrest, 0);
      if (r.success) {
        expect(after).toBeGreaterThan(before);
        incited = true;
      } else if (casusBelli(ctx, 'GRC', 'TUR').includes('spy')) caught = true;
    }
    expect(incited).toBe(true);
    expect(caught).toBe(true);
  });

  it('istihbarat başkanı sekizinci bakanlık olarak atanır', () => {
    expect(MINISTER_ROLES).toContain('intelligence');
    const ctx = newModernGame();
    runCommand(ctx, { type: 'appointMinisters', picks: {} });
    expect(ctx.s.countries.TUR.ministers!.intelligence).toBeDefined();
  });
});

describe('26.2 Faz 1 — savaş gerekçeleri', () => {
  it('gerekçesiz savaş itibar ve istikrar düşürür; gerekçeli savaş cezasızdır', () => {
    const a = newModernGame({ player: 'TUR' });
    neutral(a);
    expect(casusBelli(a, 'TUR', 'BGR')).toEqual([]);
    const rep0 = a.s.countries.TUR.reputation;
    const st0 = a.s.countries.TUR.stability;
    expect(declareWar(a, 'TUR', 'BGR')).toBeTruthy();
    expect(a.s.countries.TUR.reputation).toBeLessThan(rep0);
    expect(a.s.countries.TUR.stability).toBeLessThan(st0);

    const b = newModernGame({ player: 'TUR' });
    neutral(b);
    addGrievance(b, 'TUR', 'BGR', 'treaty');
    expect(casusBelli(b, 'TUR', 'BGR')).toContain('treaty');
    const rep1 = b.s.countries.TUR.reputation;
    expect(declareWar(b, 'TUR', 'BGR')).toBeTruthy();
    expect(b.s.countries.TUR.reputation).toBe(rep1);
  });

  it('müttefik savunması gerekçe sayılır', () => {
    const c2 = newModernGame({ player: 'TUR' });
    neutral(c2);
    c2.s.treaties.push({ id: 'x1', type: 'defensive', a: 'TUR', b: 'AZE', start: c2.s.day, end: null });
    invalidateDiplomacy(c2);
    const w = declareWar(c2, 'ARM', 'GEO');
    expect(w).toBeTruthy();
    joinWar(c2, w!, 'AZE', 'defenders');
    expect(casusBelli(c2, 'TUR', 'ARM')).toContain('ally');
  });
});

describe('26.2 Faz 1 — ambargo ve yaptırım', () => {
  it('ambargo ticaret gelirini düşürür, ticaret anlaşmasını bozar ve gerekçe verir', () => {
    const ctx = newModernGame({ player: 'USA' });
    neutral(ctx);
    computeAllBudgets(ctx);
    const before = ctx.s.countries.IRN.budget.trade;
    expect(performAction(ctx, 'USA', 'IRN', 'embargo').ok).toBe(true);
    expect(hasEmbargo(ctx, 'USA', 'IRN')).toBe(true);
    computeAllBudgets(ctx);
    expect(ctx.s.countries.IRN.budget.trade).toBeLessThan(before);
    expect(casusBelli(ctx, 'IRN', 'USA')).toContain('embargo');
    expect(performAction(ctx, 'USA', 'IRN', 'trade').error).toBe('err.embargo');
    expect(performAction(ctx, 'USA', 'IRN', 'liftEmbargo').ok).toBe(true);
    expect(hasEmbargo(ctx, 'USA', 'IRN')).toBe(false);
  });

  it('yaptırım çağrısına müttefikler katılır', () => {
    const ctx = newModernGame({ player: 'USA' });
    expect(performAction(ctx, 'USA', 'PRK', 'sanction').ok).toBe(true);
    const n = ctx.s.treaties.filter((t) => t.type === 'embargo' && t.b === 'PRK').length;
    expect(n).toBeGreaterThan(3);
  });
});

describe('26.2 Faz 1 — barış konferansı', () => {
  it('müttefik işgal ettiği bölgeyi ister; verilirse alır, verilmezse küser', () => {
    const mk = () => {
      const ctx = newModernGame({ player: 'TUR' });
      neutral(ctx);
      const w = declareWar(ctx, 'TUR', 'GRC')!;
      joinWar(ctx, w, 'BGR', 'attackers');
      const p = provincesOf(ctx, 'GRC').find((x) => x !== ctx.s.countries.GRC.capital)!;
      captureProvince(ctx, p, 'BGR');
      return { ctx, w, p };
    };
    const a = mk();
    expect(conferenceDemands(a.ctx, a.w, 'TUR', 'GRC').get(a.p)).toBe('BGR');
    applyPeace(a.ctx, a.w, 'TUR', 'GRC', [{ type: 'province', province: a.p, to: 'BGR' }], false);
    expect(a.ctx.s.provinces[a.p].owner).toBe('BGR');

    const b = mk();
    const rel0 = b.ctx.s.relations['BGR|TUR'] ?? 0;
    applyPeace(b.ctx, b.w, 'TUR', 'GRC', [{ type: 'province', province: b.p }], false);
    expect(b.ctx.s.provinces[b.p].owner).toBe('TUR');
    expect(b.ctx.s.relations['BGR|TUR'] ?? 0).toBeLessThan(rel0 + 15);
    expect(b.ctx.s.notifications.some((n) => n.key === 'notif.conferenceSnub')).toBe(true);
  });

  it('uzun oyun yeni sistemlerle hatasız ilerler', () => {
    const ctx = newModernGame({ player: 'TUR', timeStep: 'month' });
    for (let i = 0; i < 36; i++) advanceTurn(ctx);
    expect(ctx.s.turn).toBe(36);
  });
});
