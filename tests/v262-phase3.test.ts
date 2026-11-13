import { describe, it, expect } from 'vitest';
import { newModernGame } from './helpers';
import { runCommand, runCommandAs, setHumans } from '@/game/commands';
import { fireEvent } from '@/game/events';
import { getEventDef } from '@/game/data/events';
import { viewFor } from '@/game/view';
import { notify } from '@/game/notify';
import { declareWar } from '@/game/war';
import { invalidateDiplomacy } from '@/game/ctx';

describe('26.2 Faz 3 — çevrimiçi: konuk olayları ve görünüm', () => {
  it('olay konuk oyuncuya da sorulur; yalnızca sahibi yanıtlayabilir', () => {
    const ctx = newModernGame({ player: 'TUR' });
    setHumans(ctx, ['DEU']);
    expect(fireEvent(ctx, getEventDef('pandemic')!, 'DEU')).toBe(true);
    const pe = ctx.s.pendingEvents.find((p) => p.country === 'DEU')!;
    expect(pe).toBeDefined();
    // Oda sahibi konuğun olayını göremez ve yanıtlayamaz
    expect(viewFor(ctx.s, 'TUR').pendingEvents).toHaveLength(0);
    expect(viewFor(ctx.s, 'DEU').pendingEvents).toHaveLength(1);
    expect(runCommand(ctx, { type: 'resolveEvent', uid: pe.uid, option: 0 }).ok).toBe(false);
    expect(runCommandAs(ctx, 'DEU', { type: 'resolveEvent', uid: pe.uid, option: 0 }).ok).toBe(true);
    expect(ctx.s.pendingEvents).toHaveLength(0);
  });

  it('bildirimler her oyuncuya kendi gözünden süzülür', () => {
    const ctx = newModernGame({ player: 'TUR' });
    setHumans(ctx, ['DEU']);
    notify(ctx, 'economy', 'x.private', {}, { involves: ['DEU'] });
    notify(ctx, 'economy', 'x.global', {}, { involves: ['DEU'], global: true });
    const host = viewFor(ctx.s, 'TUR').notifications;
    const guest = viewFor(ctx.s, 'DEU').notifications;
    expect(host.some((n) => n.key === 'x.private')).toBe(false);
    expect(host.find((n) => n.key === 'x.global')?.player).toBe(false);
    expect(guest.find((n) => n.key === 'x.private')?.player).toBe(true);
    expect(viewFor(ctx.s, 'DEU').player).toBe('DEU');
  });

  it('oyuncular arası anlaşma: teklif karşı oyuncunun gelen kutusuna düşer ve o kabul eder', () => {
    const ctx = newModernGame({ player: 'TUR' });
    ctx.s.alliances = {};
    ctx.s.treaties = [];
    invalidateDiplomacy(ctx);
    setHumans(ctx, ['IRN']);
    const r = runCommand(ctx, { type: 'diplomacy', action: 'nap', target: 'IRN' });
    expect(r.ok).toBe(true);
    const prop = viewFor(ctx.s, 'IRN').proposals[0];
    expect(prop?.from).toBe('TUR');
    expect(runCommand(ctx, { type: 'answerProposal', id: prop.id, accept: true }).ok).toBe(false);
    expect(runCommandAs(ctx, 'IRN', { type: 'answerProposal', id: prop.id, accept: true }).ok).toBe(true);
    expect(ctx.s.treaties.some((t) => t.type === 'nap')).toBe(true);
  });

  it('oyuncular arası barış teklifi yapay zekâ yerine oyuncuya gider', () => {
    const ctx = newModernGame({ player: 'TUR' });
    ctx.s.alliances = {};
    ctx.s.treaties = [];
    invalidateDiplomacy(ctx);
    setHumans(ctx, ['IRN']);
    const w = declareWar(ctx, 'TUR', 'IRN')!;
    const r = runCommand(ctx, { type: 'proposePeace', war: w.id, target: 'IRN', beneficiary: 'TUR', terms: [] });
    expect((r.data as { sent?: boolean }).sent).toBe(true);
    const offer = viewFor(ctx.s, 'IRN').peaceOffers[0];
    expect(runCommandAs(ctx, 'IRN', { type: 'answerPeace', id: offer.id, accept: true }).ok).toBe(true);
    expect(ctx.s.wars[w.id]).toBeUndefined();
  });
});
