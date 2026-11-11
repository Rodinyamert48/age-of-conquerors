import type { GameState, Modifiers, Tag } from './types';
import { TECH_BY_ID } from './defs/techs';
import { GOVERNMENT_DEFS, POLICY_DEFS } from './defs/policies';
import { POLICY_IDS } from './types';

export function zeroModifiers(): Modifiers {
  return {
    taxEfficiency: 0,
    tradeIncome: 0,
    productionIncome: 0,
    popGrowth: 0,
    foodOutput: 0,
    resourceOutput: 0,
    buildCost: 0,
    buildTime: 0,
    moveSpeed: 0,
    supply: 0,
    attrition: 0,
    recruitTime: 0,
    recruitCost: 0,
    upkeep: 0,
    manpower: 0,
    infantryPower: 0,
    lightPower: 0,
    cavalryPower: 0,
    artilleryPower: 0,
    siegePower: 0,
    armorPower: 0,
    airPower: 0,
    navalPower: 0,
    fortDefense: 0,
    siegeSpeed: 0,
    morale: 0,
    moraleRecovery: 0,
    stability: 0,
    unrest: 0,
    relationGain: 0,
    acceptance: 0,
    researchSpeed: 0,
    warExhaustion: 0,
    development: 0,
  };
}

export function addMods(target: Modifiers, src: Partial<Modifiers>, mult = 1): void {
  for (const k in src) {
    const key = k as keyof Modifiers;
    target[key] += (src[key] ?? 0) * mult;
  }
}

/** Zorluk: yapay zekâya küçük ekonomik destek; asıl fark karar kalitesindedir (ai/) */
const DIFFICULTY_AI_MODS: Record<string, Partial<Modifiers>> = {
  easy: { taxEfficiency: -0.05, morale: -0.05 },
  normal: {},
  hard: { taxEfficiency: 0.08, morale: 0.05, recruitCost: -0.1 },
};

export function computeModifiers(s: GameState, tag: Tag): Modifiers {
  const m = zeroModifiers();
  const c = s.countries[tag];
  if (!c) return m;
  for (const id of c.techs) {
    const t = TECH_BY_ID[id];
    if (t) addMods(m, t.mods);
  }
  for (const pid of POLICY_IDS) {
    const def = POLICY_DEFS[pid];
    const lvl = c.policies[pid] ?? def.default;
    addMods(m, def.mods[lvl] ?? {});
  }
  addMods(m, GOVERNMENT_DEFS[c.government]?.mods ?? {});
  for (const tm of c.tempMods) if (tm.until > s.day) addMods(m, tm.mods);
  if (!c.isPlayer) addMods(m, DIFFICULTY_AI_MODS[s.rules.difficulty] ?? {});
  return m;
}
