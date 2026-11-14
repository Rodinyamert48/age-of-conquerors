/**
 * Yapay zekâ zamanlayıcısı. Her ülke her gün değil, zorluğa ve duruma bağlı aralıklarla düşünür;
 * savaştaki ülkeler daha sık karar verir. Böylece büyük haritada performans korunur.
 */
import type { Country, Day } from '../types';
import type { Ctx } from '../ctx';
import { isAtWar, REBEL_TAG } from '../query';
import { aiEconomy, aiBuild } from './economy';
import { aiArmies, aiRebels, aiRecruit } from './military';
import { aiDiplomacy, aiPeace } from './diplomacy';
import { hashString } from '../rng';
import { provincesOf } from '../ctx';
import { aiNuclear } from '../nuclear';

function thinkInterval(ctx: Ctx, c: Country): number {
  const d = ctx.s.rules.difficulty;
  let base = d === 'hard' ? 4 : d === 'easy' ? 12 : 7;
  if (isAtWar(ctx, c.tag)) base = Math.max(2, Math.round(base / 2));
  if (provincesOf(ctx, c.tag).length <= 2 && !isAtWar(ctx, c.tag)) base *= 3;
  return base;
}

export function aiTick(ctx: Ctx, newDay: Day): void {
  const s = ctx.s;
  // İsyancılar her tur
  aiRebels(ctx);
  for (const c of Object.values(s.countries)) {
    // Otomatik yönetim: insan oyuncu inşaatı ve/veya asker toplamayı yapay zekâya devredebilir
    if (c.alive && c.isPlayer && c.auto && (c.auto.build || c.auto.recruit) && c.ai.nextThink <= newDay) {
      c.ai.nextThink = newDay + thinkInterval(ctx, c);
      if (c.auto.build) aiBuild(ctx, c, Math.max(1, Math.min(6, Math.round(provincesOf(ctx, c.tag).length / 15))));
      if (c.auto.recruit) aiRecruit(ctx, c);
    }
    if (!c.alive || c.isPlayer || c.tag === REBEL_TAG) continue;
    if (c.ai.nextThink > newDay) continue;
    c.ai.nextThink = newDay + thinkInterval(ctx, c);
    if (c.rebelMovement) {
      aiPeace(ctx, c);
      continue;
    }
    aiEconomy(ctx, c);
    aiRecruit(ctx, c);
    aiArmies(ctx, c);
    aiPeace(ctx, c);
    if (isAtWar(ctx, c.tag)) aiNuclear(ctx, c.tag);
    if (c.ai.nextDiplo <= newDay) {
      c.ai.nextDiplo = newDay + 25 + (hashString(c.tag) % 15);
      aiDiplomacy(ctx, c);
    }
  }
}
