/**
 * İdeolojiler (19): hükûmet biçiminden bağımsız siyasi yön. Her birinin kazancı ve bedeli vardır.
 */
import type { GovernmentType, Modifiers } from '../types';

export type IdeologyFamily = 'left' | 'liberal' | 'right' | 'authoritarian' | 'religious' | 'center';

export interface IdeologyDef {
  id: string;
  name: { tr: string; en: string };
  family: IdeologyFamily;
  mods: Partial<Modifiers>;
}

const I = (id: string, tr: string, en: string, family: IdeologyFamily, mods: Partial<Modifiers>): IdeologyDef => ({ id, name: { tr, en }, family, mods });

export const IDEOLOGIES: IdeologyDef[] = [
  I('liberalism', 'Liberalizm', 'Liberalism', 'liberal', { tradeIncome: 0.1, relationGain: 0.1, manpower: -0.05 }),
  I('conservatism', 'Muhafazakârlık', 'Conservatism', 'right', { stability: 5, researchSpeed: -0.05 }),
  I('social_democracy', 'Sosyal Demokrasi', 'Social Democracy', 'left', { unrest: -4, popGrowth: 0.001, taxEfficiency: -0.04 }),
  I('socialism', 'Sosyalizm', 'Socialism', 'left', { productionIncome: 0.08, unrest: -3, tradeIncome: -0.08 }),
  I('communism', 'Komünizm', 'Communism', 'left', { productionIncome: 0.12, manpower: 0.1, tradeIncome: -0.15, relationGain: -0.1 }),
  I('nationalism', 'Milliyetçilik', 'Nationalism', 'right', { morale: 0.06, manpower: 0.1, relationGain: -0.1 }),
  I('fascism', 'Faşizm', 'Fascism', 'authoritarian', { morale: 0.1, manpower: 0.2, warExhaustion: -0.15, relationGain: -0.25, acceptance: -5 }),
  I('monarchism', 'Monarşizm', 'Monarchism', 'right', { stability: 6, taxEfficiency: 0.03, researchSpeed: -0.06 }),
  I('theocracy_i', 'Teokrasi', 'Theocracy', 'religious', { stability: 6, morale: 0.05, researchSpeed: -0.12 }),
  I('libertarianism', 'Liberteryenizm', 'Libertarianism', 'liberal', { tradeIncome: 0.12, development: 0.003, taxEfficiency: -0.08 }),
  I('technocracy', 'Teknokrasi', 'Technocracy', 'center', { researchSpeed: 0.15, buildCost: -0.05, stability: -3 }),
  I('green', 'Yeşil Siyaset', 'Green Politics', 'left', { popGrowth: 0.001, foodOutput: 0.08, productionIncome: -0.06 }),
  I('populism', 'Popülizm', 'Populism', 'center', { stability: 4, unrest: -3, development: -0.003 }),
  I('militarism', 'Militarizm', 'Militarism', 'authoritarian', { infantryPower: 0.08, recruitTime: -0.15, upkeep: -0.05, tradeIncome: -0.08 }),
  I('kemalism', 'Kemalizm', 'Kemalism', 'center', { researchSpeed: 0.08, stability: 3, development: 0.002, relationGain: -0.05 }),
  I('anarchism', 'Anarşizm', 'Anarchism', 'left', { unrest: -6, upkeep: -0.1, taxEfficiency: -0.2, morale: -0.05 }),
  I('centrism', 'Merkezcilik', 'Centrism', 'center', { acceptance: 4, relationGain: 0.08 }),
  I('imperialism', 'Emperyalizm', 'Imperialism', 'authoritarian', { siegeSpeed: 0.15, manpower: 0.1, unrest: 4, relationGain: -0.15 }),
  I('state_capitalism', 'Devlet Kapitalizmi', 'State Capitalism', 'authoritarian', { productionIncome: 0.1, buildCost: -0.1, unrest: 3, relationGain: -0.05 }),
];

export const IDEOLOGY_BY_ID: Record<string, IdeologyDef> = Object.fromEntries(IDEOLOGIES.map((x) => [x.id, x]));

/** Hükûmet biçimine göre başlangıç ideolojisi */
export const DEFAULT_IDEOLOGY: Record<GovernmentType, string> = {
  republic: 'liberalism',
  constitutional_monarchy: 'conservatism',
  absolute_monarchy: 'monarchism',
  one_party: 'communism',
  theocracy: 'theocracy_i',
  military_junta: 'militarism',
  fascist: 'fascism',
  tribal: 'conservatism',
};

/** Bazı ülkelerin 2020'deki bilinen yönü */
export const COUNTRY_IDEOLOGY: Record<string, string> = {
  TUR: 'conservatism',
  USA: 'liberalism',
  CHN: 'state_capitalism',
  RUS: 'nationalism',
  DEU: 'centrism',
  FRA: 'centrism',
  GBR: 'conservatism',
  SWE: 'social_democracy',
  NOR: 'social_democracy',
  DNK: 'social_democracy',
  FIN: 'social_democracy',
  IND: 'nationalism',
  BRA: 'populism',
  JPN: 'conservatism',
  PRK: 'communism',
  CUB: 'communism',
  VNM: 'state_capitalism',
  IRN: 'theocracy_i',
  SAU: 'monarchism',
  HUN: 'nationalism',
  POL: 'conservatism',
  VEN: 'socialism',
  SGP: 'technocracy',
};

export function familyAffinity(a: IdeologyFamily, b: IdeologyFamily): number {
  if (a === b) return 6;
  const pair = [a, b].sort().join('|');
  if (pair === 'authoritarian|liberal' || pair === 'authoritarian|left') return -8;
  if (pair === 'left|right' || pair === 'liberal|religious') return -5;
  return 0;
}
