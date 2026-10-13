import type { GovernmentType, Modifiers, PolicyId } from '../types';

export interface PolicyDef {
  id: PolicyId;
  /** seviye başına brüt vergi gelirinin yüzdesi olarak maliyet */
  cost: number[];
  mods: Partial<Modifiers>[];
  default: number;
}

/** Vergi oranı seviyeleri (üretimin payı) */
export const TAX_RATES = [0.08, 0.11, 0.15, 0.19, 0.24];

export const POLICY_DEFS: Record<PolicyId, PolicyDef> = {
  tax: {
    id: 'tax',
    cost: [0, 0, 0, 0, 0],
    mods: [
      { stability: 12, development: 0.004 },
      { stability: 6, development: 0.002 },
      {},
      { stability: -8, development: -0.002 },
      { stability: -18, development: -0.005, unrest: 6 },
    ],
    default: 2,
  },
  military: {
    id: 'military',
    cost: [0, 0, 0, 0, 0],
    mods: [
      { upkeep: -0.4, morale: -0.3, manpower: -0.4, moraleRecovery: -0.3 },
      { upkeep: -0.2, morale: -0.15, manpower: -0.2, moraleRecovery: -0.15 },
      {},
      { upkeep: 0.2, morale: 0.08, manpower: 0.25, moraleRecovery: 0.15 },
      { upkeep: 0.5, morale: 0.15, manpower: 0.6, moraleRecovery: 0.3, stability: -3 },
    ],
    default: 2,
  },
  infrastructure: {
    id: 'infrastructure',
    cost: [0, 0.05, 0.1, 0.15, 0.21],
    mods: [
      { moveSpeed: -0.05, supply: -0.1 },
      {},
      { moveSpeed: 0.05, supply: 0.1, buildCost: -0.05 },
      { moveSpeed: 0.1, supply: 0.2, buildCost: -0.1 },
      { moveSpeed: 0.15, supply: 0.3, buildCost: -0.15, buildTime: -0.1 },
    ],
    default: 1,
  },
  education: {
    id: 'education',
    cost: [0, 0.06, 0.12, 0.18, 0.25],
    mods: [{ researchSpeed: -0.3 }, {}, { researchSpeed: 0.2 }, { researchSpeed: 0.4 }, { researchSpeed: 0.65 }],
    default: 1,
  },
  security: {
    id: 'security',
    cost: [0, 0.03, 0.06, 0.09, 0.13],
    mods: [{ unrest: 6 }, {}, { unrest: -5, stability: 1 }, { unrest: -10, stability: 2 }, { unrest: -16, stability: 2, relationGain: -0.1 }],
    default: 1,
  },
  welfare: {
    id: 'welfare',
    cost: [0, 0.12, 0.24, 0.34, 0.45],
    mods: [
      { stability: -10, popGrowth: -0.003 },
      { stability: -3 },
      { stability: 3, popGrowth: 0.001 },
      { stability: 7, popGrowth: 0.002 },
      { stability: 11, popGrowth: 0.003 },
    ],
    default: 2,
  },
  development: {
    id: 'development',
    cost: [0, 0.05, 0.1, 0.15, 0.2],
    mods: [{}, { development: 0.004 }, { development: 0.008 }, { development: 0.012 }, { development: 0.016 }],
    default: 1,
  },
};

export interface GovernmentDef {
  id: GovernmentType;
  group: 'democratic' | 'autocratic' | 'communist' | 'theocratic' | 'fascist';
  mods: Partial<Modifiers>;
}

export const GOVERNMENT_DEFS: Record<GovernmentType, GovernmentDef> = {
  republic: { id: 'republic', group: 'democratic', mods: { acceptance: 5, warExhaustion: 0.1, relationGain: 0.1 } },
  constitutional_monarchy: { id: 'constitutional_monarchy', group: 'democratic', mods: { stability: 5, acceptance: 3 } },
  absolute_monarchy: { id: 'absolute_monarchy', group: 'autocratic', mods: { stability: 3, taxEfficiency: 0.05, unrest: -2 } },
  one_party: { id: 'one_party', group: 'communist', mods: { unrest: -8, warExhaustion: -0.15, manpower: 0.1 } },
  theocracy: { id: 'theocracy', group: 'theocratic', mods: { stability: 5, researchSpeed: -0.1, morale: 0.05 } },
  military_junta: { id: 'military_junta', group: 'autocratic', mods: { morale: 0.1, stability: -5, manpower: 0.2 } },
  fascist: { id: 'fascist', group: 'fascist', mods: { morale: 0.1, manpower: 0.25, warExhaustion: -0.2, relationGain: -0.2 } },
  tribal: { id: 'tribal', group: 'autocratic', mods: { taxEfficiency: -0.15, manpower: 0.15 } },
};
