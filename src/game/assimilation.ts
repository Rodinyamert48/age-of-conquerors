/**
 * Fethedilen bölgelerin asimilasyonu (Age of History 2 gibi): çekirdek olmayan bölgeler huzursuzdur ve
 * isyan çıkarabilir. Para harcanarak başlatılan asimilasyon bölgeyi kademeli olarak çekirdek yapar.
 */
import type { Ctx } from './ctx';
import { provinceOutput } from './economy';
import type { Tag } from './types';
import { foreignFaith } from './society';

export const ASSIMILATION_DAYS = 5 * 365;

export function assimilationCost(ctx: Ctx, p: number): number {
  return Math.max(0.2, provinceOutput(ctx, p) * 0.35);
}

export function canAssimilate(ctx: Ctx, tag: Tag, p: number): { ok: boolean; error?: string } {
  const ps = ctx.s.provinces[p];
  if (!ps || ps.owner !== tag) return { ok: false, error: 'err.notFound' };
  if (ps.cores.includes(tag)) return { ok: false, error: 'assimilate.alreadyCore' };
  if (ps.controller !== tag) return { ok: false, error: 'assimilate.occupied' };
  if (ps.assimilating !== undefined) return { ok: false, error: 'assimilate.inProgress' };
  if (ctx.s.countries[tag].treasury < assimilationCost(ctx, p)) return { ok: false, error: 'err.noMoney' };
  return { ok: true };
}

export function startAssimilation(ctx: Ctx, tag: Tag, p: number): { ok: boolean; error?: string } {
  const chk = canAssimilate(ctx, tag, p);
  if (!chk.ok) return chk;
  ctx.s.countries[tag].treasury -= assimilationCost(ctx, p);
  // Farklı inançtan halkın asimilasyonu daha uzun sürer
  ctx.s.provinces[p].assimilating = Math.round(ASSIMILATION_DAYS * (foreignFaith(ctx, p) ? 1.4 : 1));
  return { ok: true };
}

/** Aylık: süreç ilerler; bitince bölge çekirdek olur. Yapay zekâ parası yetiyorsa kendisi başlatır. */
export function assimilationTick(ctx: Ctx, days: number): void {
  const s = ctx.s;
  for (let p = 0; p < ctx.w.P; p++) {
    const ps = s.provinces[p];
    if (ps.assimilating !== undefined) {
      if (ps.controller !== ps.owner || ps.cores.includes(ps.owner)) {
        delete ps.assimilating;
        continue;
      }
      ps.assimilating -= days;
      if (ps.assimilating <= 0) {
        delete ps.assimilating;
        ps.cores.push(ps.owner);
        ps.culture = ps.owner;
        ps.unrest = Math.max(0, ps.unrest - 20);
      }
    } else if (s.countries[ps.owner] && !s.countries[ps.owner].isPlayer && !ps.cores.includes(ps.owner) && ps.controller === ps.owner) {
      const c = s.countries[ps.owner];
      if (c.treasury > assimilationCost(ctx, p) * 6) startAssimilation(ctx, ps.owner, p);
    }
  }
}
