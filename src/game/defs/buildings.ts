import type { BuildingId, Terrain } from '../types';

export interface BuildingDef {
  id: BuildingId;
  maxLevel: number;
  /** maliyet = (base × ortalama bölge üretimi + own × bölge üretimi) × seviye çarpanı */
  baseCost: number;
  ownCost: number;
  days: number;
  timber: number;
  iron: number;
  /** seviye n için gereken teknoloji (index = seviye-1) */
  techLevels: (string | null)[];
  /** arazi maliyet çarpanı */
  terrainCost?: Partial<Record<Terrain, number>>;
  /** izin verilmeyen araziler */
  forbiddenTerrain?: Terrain[];
  coastal?: boolean;
  /** dönem nüfus ölçeğine göre minimum nüfus (seviye başına) */
  minPop?: number[];
}

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  agriculture: {
    id: 'agriculture',
    maxLevel: 3,
    baseCost: 0.15,
    ownCost: 0.05,
    days: 180,
    timber: 2,
    iron: 1,
    techLevels: [null, 'a_crop_rotation', 'a_fertilizers'],
    forbiddenTerrain: ['desert', 'tundra', 'mountains'],
  },
  industry: {
    id: 'industry',
    maxLevel: 3,
    baseCost: 0.3,
    ownCost: 0.1,
    days: 360,
    timber: 3,
    iron: 4,
    techLevels: [null, 'a_steam_power', 'a_assembly_line'],
    minPop: [150_000, 400_000, 900_000],
  },
  trade: {
    id: 'trade',
    maxLevel: 3,
    baseCost: 0.2,
    ownCost: 0.08,
    days: 240,
    timber: 3,
    iron: 1,
    techLevels: [null, 'e_joint_stock', 'e_free_trade'],
    minPop: [100_000, 300_000, 700_000],
  },
  port: {
    id: 'port',
    maxLevel: 3,
    baseCost: 0.25,
    ownCost: 0.04,
    days: 300,
    timber: 6,
    iron: 2,
    techLevels: [null, 'n_copper_hull', 'n_steamships'],
    coastal: true,
  },
  road: {
    id: 'road',
    maxLevel: 3,
    baseCost: 0.1,
    ownCost: 0.03,
    days: 150,
    timber: 1,
    iron: 1,
    techLevels: [null, 'i_turnpikes', 'i_railways'],
    terrainCost: { mountains: 2.5, hills: 1.5, jungle: 2, marsh: 2, desert: 1.3, tundra: 1.5, forest: 1.3 },
  },
  university: {
    id: 'university',
    maxLevel: 2,
    baseCost: 0.35,
    ownCost: 0.05,
    days: 540,
    timber: 2,
    iron: 1,
    techLevels: ['m_printing', 'm_public_education'],
    minPop: [250_000, 800_000],
  },
  military: {
    id: 'military',
    maxLevel: 3,
    baseCost: 0.25,
    ownCost: 0.03,
    days: 300,
    timber: 3,
    iron: 3,
    techLevels: [null, 'm_standing_army', 'm_conscription'],
  },
  fort: {
    id: 'fort',
    maxLevel: 3,
    baseCost: 0.3,
    ownCost: 0.02,
    days: 365,
    timber: 4,
    iron: 4,
    techLevels: [null, 'g_magazines', 'l_machine_guns'],
    terrainCost: { mountains: 1.3, hills: 1.1 },
  },
};

export const BUILDING_INDEX: Record<BuildingId, number> = {
  agriculture: 0,
  industry: 1,
  trade: 2,
  port: 3,
  road: 4,
  university: 5,
  military: 6,
  fort: 7,
};
