/**
 * Yapay zekâ zamanlayıcısı. Her ülke her gün değil, zorluğa ve duruma bağlı aralıklarla düşünür;
 * savaştaki ülkeler daha sık karar verir. Böylece büyük haritada performans korunur.
 */
import type { Country, Day } from '../types';
import type { Ctx } from '../ctx';
import { isAtWar, REBEL_TAG } from '../query';
import { aiEconomy } from './economy';
import { aiArmies, aiRebels, aiRecruit } from './military';
import { aiDiplomacy, aiPeace } from './diplomacy';
import { hashString } from '../rng';
import { provincesOf } from '../ctx';

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
    if (c.ai.nextDiplo <= newDay) {
      c.ai.nextDiplo = newDay + 25 + (hashString(c.tag) % 15);
      aiDiplomacy(ctx, c);
    }
  }
}
