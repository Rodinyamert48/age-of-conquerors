import type { Terrain } from '../types';

export interface TerrainDef {
  /** savunan için muharebe bonusu */
  defense: number;
  /** hareket hızı çarpanı (bölgeye girerken) */
  move: number;
  /** ikmal kapasitesi çarpanı */
  supply: number;
  /** aylık temel yıpranma (oran) */
  attrition: number;
  /** cephe genişliği çarpanı (aynı anda savaşabilecek asker) */
  width: number;
  /** kuşatma süresi çarpanı */
  siege: number;
}

export const TERRAIN_DEFS: Record<Terrain, TerrainDef> = {
  plains: { defense: 0, move: 1, supply: 1, attrition: 0, width: 1, siege: 1 },
  forest: { defense: 0.15, move: 0.8, supply: 0.7, attrition: 0.005, width: 0.8, siege: 1.1 },
  hills: { defense: 0.25, move: 0.75, supply: 0.75, attrition: 0.005, width: 0.8, siege: 1.2 },
  mountains: { defense: 0.5, move: 0.55, supply: 0.45, attrition: 0.015, width: 0.55, siege: 1.5 },
  desert: { defense: 0, move: 0.75, supply: 0.3, attrition: 0.02, width: 1, siege: 1 },
  tundra: { defense: 0.1, move: 0.65, supply: 0.3, attrition: 0.02, width: 0.8, siege: 1.1 },
  jungle: { defense: 0.25, move: 0.6, supply: 0.45, attrition: 0.02, width: 0.6, siege: 1.3 },
  marsh: { defense: 0.3, move: 0.6, supply: 0.5, attrition: 0.015, width: 0.6, siege: 1.3 },
};

export const TERRAIN_ORDER: Terrain[] = ['plains', 'forest', 'hills', 'mountains', 'desert', 'tundra', 'jungle', 'marsh'];
