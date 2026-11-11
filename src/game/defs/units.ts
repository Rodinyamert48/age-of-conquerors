import type { Terrain, UnitType } from '../types';

export interface UnitDef {
  id: UnitType;
  /** 1000 asker (donanma için gemi) başına saldırı/savunma gücü */
  attack: number;
  defense: number;
  /** km/gün */
  speed: number;
  /** maliyet çarpanları (fiyat birimine göre) */
  cost: number;
  upkeep: number;
  /** bir birim (1 asker / 1 gemi) başına insan gücü */
  manpower: number;
  /** toplama süresi (gün) */
  days: number;
  /** 1000 asker / 1 gemi başına kaynak gereksinimi */
  iron: number;
  timber: number;
  coal: number;
  /** kuşatma katkısı (1000 asker başına) */
  siege: number;
  /** tahkimat etkisini azaltma (0..1) */
  breakthrough: number;
  terrain: Partial<Record<Terrain, number>>;
  /** karşı birlik türlerine karşı saldırı çarpanı */
  vs: Partial<Record<UnitType, number>>;
  /** bu birim için gereken teknoloji */
  requires: string | null;
  /** bu teknoloji araştırılınca toplanamaz */
  obsoleteBy: string | null;
  /** birim miktar adımı (arayüz) */
  step: number;
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  infantry: {
    id: 'infantry',
    attack: 1.0,
    defense: 1.25,
    speed: 24,
    cost: 1,
    upkeep: 1,
    manpower: 1,
    days: 30,
    iron: 0.4,
    timber: 0,
    coal: 0,
    siege: 0.15,
    breakthrough: 0,
    terrain: { mountains: 0.95, forest: 1.0 },
    vs: {},
    requires: null,
    obsoleteBy: null,
    step: 1000,
  },
  light: {
    id: 'light',
    attack: 0.95,
    defense: 0.85,
    speed: 30,
    cost: 0.9,
    upkeep: 0.9,
    manpower: 1,
    days: 25,
    iron: 0.25,
    timber: 0,
    coal: 0,
    siege: 0.1,
    breakthrough: 0,
    terrain: { forest: 1.3, hills: 1.2, mountains: 1.3, jungle: 1.35, marsh: 1.2, plains: 0.9, desert: 0.95 },
    vs: { artillery: 1.2, siege: 1.3 },
    requires: null,
    obsoleteBy: null,
    step: 1000,
  },
  cavalry: {
    id: 'cavalry',
    attack: 1.6,
    defense: 0.8,
    speed: 40,
    cost: 1.8,
    upkeep: 1.6,
    manpower: 1,
    days: 45,
    iron: 0.4,
    timber: 0,
    coal: 0,
    siege: 0.05,
    breakthrough: 0,
    terrain: { plains: 1.25, desert: 1.15, tundra: 0.9, hills: 0.85, forest: 0.75, mountains: 0.6, jungle: 0.55, marsh: 0.6 },
    vs: { light: 1.3, artillery: 1.4, siege: 1.4 },
    requires: null,
    obsoleteBy: 'l_mechanization',
    step: 1000,
  },
  artillery: {
    id: 'artillery',
    attack: 2.1,
    defense: 0.6,
    speed: 18,
    cost: 2.4,
    upkeep: 2,
    manpower: 1,
    days: 60,
    iron: 2,
    timber: 0.3,
    coal: 0,
    siege: 1.2,
    breakthrough: 0.5,
    terrain: { mountains: 0.75, jungle: 0.7, marsh: 0.7, forest: 0.85 },
    vs: { infantry: 1.2 },
    requires: 't_field_cannons',
    obsoleteBy: null,
    step: 1000,
  },
  siege: {
    id: 'siege',
    attack: 0.6,
    defense: 0.4,
    speed: 12,
    cost: 2,
    upkeep: 1.5,
    manpower: 1,
    days: 60,
    iron: 1.5,
    timber: 1,
    coal: 0,
    siege: 3,
    breakthrough: 0.8,
    terrain: { mountains: 0.6, jungle: 0.6, marsh: 0.6 },
    vs: {},
    requires: null,
    obsoleteBy: 't_self_propelled',
    step: 1000,
  },
  armor: {
    id: 'armor',
    attack: 3.6,
    defense: 2.6,
    speed: 35,
    cost: 6,
    upkeep: 4,
    manpower: 1,
    days: 90,
    iron: 5,
    timber: 0,
    coal: 1,
    siege: 0.5,
    breakthrough: 0.6,
    terrain: { plains: 1.25, desert: 1.15, hills: 0.85, forest: 0.75, mountains: 0.55, jungle: 0.5, marsh: 0.5, tundra: 0.9 },
    vs: { infantry: 1.25, cavalry: 1.5, light: 1.2 },
    requires: 'l_tanks',
    obsoleteBy: null,
    step: 1000,
  },
  air: {
    id: 'air',
    attack: 3.2,
    defense: 1,
    speed: 60,
    cost: 8,
    upkeep: 5,
    manpower: 1,
    days: 120,
    iron: 4,
    timber: 0,
    coal: 1,
    siege: 0.6,
    breakthrough: 0.4,
    terrain: { mountains: 0.9, jungle: 0.8, forest: 0.9 },
    vs: { armor: 1.3, artillery: 1.3 },
    requires: 't_aviation',
    obsoleteBy: null,
    step: 1000,
  },
  navy: {
    id: 'navy',
    attack: 10,
    defense: 10,
    speed: 220,
    cost: 25,
    upkeep: 8,
    manpower: 300,
    days: 180,
    iron: 20,
    timber: 12,
    coal: 2,
    siege: 0,
    breakthrough: 0,
    terrain: {},
    vs: {},
    requires: null,
    obsoleteBy: null,
    step: 1,
  },
};

export const UNIT_ORDER: UnitType[] = ['infantry', 'light', 'cavalry', 'artillery', 'siege', 'armor', 'air', 'navy'];

/** Modifiers anahtarı: birim türüne göre güç bonusu */
export const UNIT_POWER_MOD = {
  infantry: 'infantryPower',
  light: 'lightPower',
  cavalry: 'cavalryPower',
  artillery: 'artilleryPower',
  siege: 'siegePower',
  armor: 'armorPower',
  air: 'airPower',
  navy: 'navalPower',
} as const;
