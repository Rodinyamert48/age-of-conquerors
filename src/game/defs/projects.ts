/** Mega projeler: yıllar süren, bitince kalıcı etki veren tek seferlik yapılar */
import type { Modifiers } from '../types';

export interface MegaProjectDef {
  id: string;
  name: { tr: string; en: string };
  /** maliyet: yıllık gelirin katı */
  cost: number;
  years: number;
  mods: Partial<Modifiers>;
}

export const MEGA_PROJECTS: Record<string, MegaProjectDef> = {
  canal: { id: 'canal', name: { tr: 'Büyük Kanal', en: 'Grand Canal' }, cost: 1.5, years: 6, mods: { tradeIncome: 0.12 } },
  dam: { id: 'dam', name: { tr: 'Dev Baraj', en: 'Great Dam' }, cost: 1.0, years: 4, mods: { foodOutput: 0.1, productionIncome: 0.05 } },
  space: { id: 'space', name: { tr: 'Uzay Üssü', en: 'Space Centre' }, cost: 2.5, years: 8, mods: { researchSpeed: 0.15, stability: 3 } },
  rail: { id: 'rail', name: { tr: 'Hızlı Tren Ağı', en: 'High-Speed Rail' }, cost: 1.2, years: 5, mods: { moveSpeed: 0.1, development: 0.003 } },
  reactor: { id: 'reactor', name: { tr: 'Nükleer Santral', en: 'Nuclear Power Plant' }, cost: 1.5, years: 6, mods: { productionIncome: 0.1 } },
  expo: { id: 'expo', name: { tr: 'Dünya Fuarı', en: 'World Expo' }, cost: 0.8, years: 3, mods: { relationGain: 0.15, tradeIncome: 0.04 } },
};

/** Büyük güç ayrıcalıkları (ilk 8) */
export const GREAT_POWER_MODS: Partial<Modifiers> = { acceptance: 5, relationGain: 0.1, spyPower: 0.1 };
