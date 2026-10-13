/**
 * Modern Dünya — 1 Ocak 2020.
 *
 * Veri kaynakları:
 *  - Sınırlar: Natural Earth v5.1.2 fiilî (de facto) görünümü.
 *  - Nüfus ve GSYH: Natural Earth admin-0 POP_EST / GDP_MD alanları (2019 tahminleri, Dünya Bankası kaynaklı).
 *  - Bölgelere dağılım: şehir nüfusları (Natural Earth populated places) + arazi uygunluğu ile tahmin edilmiştir.
 *  - Askerî güçler: başlıca ülkeler için yaklaşık aktif personel (IISS Military Balance 2020 düzeyinde,
 *    yuvarlanmış); diğerleri nüfusa göre tahmin. Kesin değer iddiası taşımaz.
 *  - İttifaklar ve anlaşmalar: 1 Ocak 2020 itibarıyla NATO (29 üye), KGAÖ, AB/AEA iç pazarı,
 *    AB–Türkiye Gümrük Birliği, NAFTA, Mercosur, Avrasya Ekonomik Birliği, ASEAN ve başlıca ikili savunma anlaşmaları.
 */
import type { GovernmentType, Tag, TreatyType } from '../types';
import type { World } from '../world';
import type { ScenarioCountryDef, ScenarioInfo, ScenarioSetup } from './types';
import neCountriesJson from '../../data/generated/ne-countries.json';
import { assignColors } from './colors';
import { defaultBuildings, distributeOutput, findCapital, ownerNeighbors, pairwise, placeArmies, provincesByOwner, unitMix, type IncomeTier } from './common';
import { UNIT_DEFS } from '../defs/units';
import { TECHS } from '../defs/techs';
import { BUILDING_IDS } from '../types';

interface NeCountry {
  a3: string;
  sov: string;
  type: string;
  name: string;
  nameTr: string;
  iso2: string | null;
  pop: number;
  gdpMd: number;
  incomeGroup: string;
  continent: string;
}
const NE = neCountriesJson as unknown as Record<string, NeCountry>;

/** Bağımlı bölgeler → egemen ülke (fiilî yönetim) */
export const MODERN_OWNER: Record<string, Tag> = {
  GRL: 'DNK',
  FRO: 'DNK',
  HKG: 'CHN',
  MAC: 'CHN',
  ALD: 'FIN',
  JEY: 'GBR',
  GGY: 'GBR',
  IMN: 'GBR',
  BMU: 'GBR',
  CYM: 'GBR',
  VGB: 'GBR',
  AIA: 'GBR',
  TCA: 'GBR',
  GIB: 'GBR',
  FLK: 'GBR',
  CUW: 'NLD',
  ABW: 'NLD',
  SXM: 'NLD',
  PRI: 'USA',
  GUM: 'USA',
  VIR: 'USA',
  ASM: 'USA',
  MNP: 'USA',
  NCL: 'FRA',
  PYF: 'FRA',
  WLF: 'FRA',
  BLM: 'FRA',
  MAF: 'FRA',
  SPM: 'FRA',
  COK: 'NZL',
  SAH: 'MAR',
};

/** Özel bayraklar (flag-icons'ta bulunmayan) */
const CUSTOM_FLAGS: Record<string, string> = { SOL: 'x-somaliland', CYN: 'x-northern-cyprus' };

const GOV: Record<string, GovernmentType> = {};
for (const t of ['SAU', 'OMN', 'BRN', 'SWZ', 'QAT', 'ARE']) GOV[t] = 'absolute_monarchy';
for (const t of [
  'GBR', 'ESP', 'NLD', 'BEL', 'NOR', 'SWE', 'DNK', 'JPN', 'THA', 'MAR', 'JOR', 'KWT', 'BHR', 'KHM', 'MYS', 'LSO', 'BTN', 'TON', 'CAN', 'AUS', 'NZL',
  'LUX', 'LIE', 'MCO', 'AND', 'JAM', 'BHS', 'PNG', 'SLB', 'TUV', 'BLZ', 'ATG', 'KNA', 'LCA', 'VCT', 'GRD', 'BRB',
]) GOV[t] = 'constitutional_monarchy';
for (const t of ['CHN', 'VNM', 'LAO', 'CUB', 'PRK', 'ERI']) GOV[t] = 'one_party';
GOV.IRN = 'theocracy';

/** Yaklaşık aktif askerî personel (bin). Kaynak düzeyi: IISS Military Balance 2020; yuvarlanmış. */
const ACTIVE_K: Record<string, number> = {
  CHN: 2035, IND: 1455, USA: 1388, PRK: 1280, RUS: 900, PAK: 652, KOR: 599, IRN: 610, VNM: 482, EGY: 439, MMR: 406, IDN: 396,
  BRA: 367, THA: 361, TUR: 355, COL: 293, MEX: 277, SAU: 227, JPN: 247, IRQ: 193, DZA: 130, MAR: 196, ISR: 170, TWN: 163, FRA: 203,
  DEU: 184, ITA: 166, GBR: 148, UKR: 209, ERI: 202, SYR: 169, AFG: 174, ETH: 138, NGA: 143, SDN: 104, VEN: 123, POL: 114, GRC: 142,
  ESP: 120, PER: 81, ARG: 74, CUB: 49, JOR: 101, BGD: 163, LKA: 255, PHL: 143, MYS: 113, AUS: 59, CAN: 68, KAZ: 39, AZE: 67, ARM: 45,
  BLR: 45, ROU: 69, CHL: 78, ECU: 41, SGP: 51, YEM: 40, AGO: 107, COD: 134, TZA: 27, KEN: 24, UGA: 45, ZAF: 74, ZWE: 29, CMR: 25,
  MOZ: 11, TCD: 33, MLI: 21, NER: 11, BFA: 11, SEN: 17, CIV: 27, GHA: 15, TUN: 36, OMN: 43, ARE: 63, KWT: 17, QAT: 17, BHR: 8,
  LBN: 60, NPL: 97, KHM: 124, LAO: 29, MNG: 10, UZB: 48, TKM: 37, TJK: 9, KGZ: 11, GEO: 21, SRB: 28, HUN: 28, CZE: 25, AUT: 22,
  CHE: 19, NLD: 34, BEL: 24, SWE: 15, NOR: 23, DNK: 15, FIN: 22, PRT: 27, IRL: 9, HRV: 15, BGR: 37, SVK: 16, LTU: 21, LVA: 6,
  EST: 7, SVN: 7, ALB: 8, MKD: 8, MNE: 2, BIH: 11, MDA: 5, CYP: 15, NZL: 9, BOL: 34, PRY: 14, URY: 22, GTM: 18, HND: 15, SLV: 25,
  NIC: 12, DOM: 56, LBY: 30, SOM: 20, SSD: 185, CAF: 8, COG: 10, GAB: 5, BEN: 7, TGO: 9, GIN: 10, SLE: 9, LBR: 2, MRT: 16, BDI: 30,
  RWA: 33, MWI: 11, ZMB: 15, NAM: 10, BWA: 9, MDG: 14, DJI: 10, CYN: 3, KOS: 3, SOL: 10, PSX: 0,
};
/** Orduları olmayan devletler */
const NO_ARMY = new Set(['CRI', 'PAN', 'ISL', 'MCO', 'AND', 'LIE', 'KIR', 'TUV', 'NRU', 'PLW', 'FSM', 'MHL', 'SLB', 'VUT', 'WSM', 'GRD', 'LCA', 'VCT', 'DMA', 'MUS', 'SMR']);

/** Yaklaşık savaş gemisi sayısı (oyun birimi; ana muharebe gemileri + denizaltılar) */
const SHIPS: Record<string, number> = {
  USA: 110, CHN: 100, RUS: 60, JPN: 50, IND: 40, KOR: 40, GBR: 30, FRA: 30, TUR: 30, PRK: 20, ITA: 25, TWN: 25, GRC: 20, DEU: 15,
  ESP: 15, AUS: 15, BRA: 15, IRN: 15, EGY: 15, IDN: 15, CAN: 12, PAK: 12, VNM: 12, SAU: 10, THA: 10, CHL: 10, DZA: 10, ISR: 8,
  NLD: 8, NOR: 8, SWE: 8, SGP: 8, MYS: 8, ARG: 8, PER: 8, MEX: 8, COL: 8, ZAF: 6, DNK: 6, PRT: 6, ARE: 6, POL: 5, MAR: 4, PHL: 4,
  UKR: 3, FIN: 4, ROU: 3, BGR: 3, NGA: 3, BGD: 6, MMR: 5, LKA: 4, ECU: 3, VEN: 4, OMN: 3, KWT: 2, QAT: 2, CUB: 2, NZL: 2, IRL: 2,
};

/** İlişki başlangıç değerleri (oyun değerleri; iyi bilinen ilişkileri yaklaşık yansıtır) */
const RELATIONS: [Tag, Tag, number][] = [
  ['USA', 'IRN', -80], ['USA', 'PRK', -85], ['KOR', 'PRK', -70], ['JPN', 'PRK', -70], ['IND', 'PAK', -70], ['ISR', 'IRN', -90],
  ['ISR', 'SYR', -80], ['ISR', 'LBN', -60], ['ARM', 'AZE', -90], ['CHN', 'TWN', -60], ['RUS', 'UKR', -60], ['RUS', 'GEO', -50],
  ['SAU', 'IRN', -70], ['SAU', 'QAT', -50], ['ARE', 'QAT', -50], ['BHR', 'QAT', -40], ['GRC', 'TUR', -20], ['CYP', 'TUR', -60],
  ['CYP', 'CYN', -60], ['TUR', 'CYN', 90], ['SRB', 'KOS', -70], ['USA', 'CUB', -40], ['USA', 'VEN', -60], ['COL', 'VEN', -40],
  ['MAR', 'DZA', -40], ['CHN', 'IND', -30], ['CHN', 'JPN', -20], ['CHN', 'USA', -20], ['USA', 'RUS', -40], ['TUR', 'SYR', -60],
  ['TUR', 'ARM', -50], ['TUR', 'AZE', 85], ['PAK', 'AFG', -20], ['ETH', 'EGY', -20], ['SOM', 'SOL', -50], ['ISR', 'PSX', -70],
  ['USA', 'ISR', 70], ['USA', 'GBR', 70], ['GBR', 'ARG', -30], ['RUS', 'BLR', 60], ['CHN', 'PAK', 60], ['CHN', 'PRK', 50],
  ['RUS', 'SYR', 60], ['IRN', 'SYR', 60], ['USA', 'SYR', -60], ['RUS', 'CHN', 40], ['USA', 'JPN', 60], ['USA', 'KOR', 55],
  ['USA', 'CAN', 70], ['USA', 'AUS', 65], ['FRA', 'DEU', 60], ['RUS', 'ARM', 40], ['RUS', 'KAZ', 50], ['TUR', 'QAT', 60],
  ['TUR', 'PAK', 50], ['IND', 'BGD', 30], ['SAU', 'ARE', 60], ['EGY', 'SAU', 50], ['EGY', 'ARE', 50], ['IRN', 'IRQ', 30],
  ['ISR', 'EGY', 10], ['ISR', 'JOR', 10], ['RUS', 'IRN', 30], ['RUS', 'SRB', 50], ['GRC', 'CYP', 70], ['ETH', 'ERI', 10],
  ['SDN', 'SDS', -30], ['MAR', 'SAU', 40], ['KOR', 'JPN', -10], ['VNM', 'CHN', -20], ['PHL', 'CHN', -15], ['AUS', 'NZL', 70],
];

const NATO = ['USA', 'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FRA', 'DEU', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'TUR', 'GBR'];
const CSTO = ['RUS', 'ARM', 'BLR', 'KAZ', 'KGZ', 'TJK'];
const EU28 = ['AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'GBR'];
const EEA_PLUS = ['NOR', 'ISL', 'LIE', 'CHE'];
const ASEAN = ['BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'VNM'];

function tierOf(group: string | undefined): IncomeTier {
  if (!group) return 'lower';
  if (group.startsWith('1.') || group.startsWith('2.')) return 'high';
  if (group.startsWith('3.')) return 'upper';
  if (group.startsWith('4.')) return 'lower';
  return 'low';
}

const TECH_YEAR: Record<IncomeTier, number> = { high: 2015, upper: 2005, lower: 1995, low: 1985 };

export function buildModern(world: World): ScenarioSetup {
  const P = world.P;
  const owner: Tag[] = [];
  const pop: number[] = [];
  for (let p = 0; p < P; p++) {
    const wp = world.data.provinces[p];
    owner.push(MODERN_OWNER[wp.a3] ?? wp.a3);
    pop.push(wp.pop);
  }
  // Üretim: her NE varlığının GSYH'si kendi bölgelerine dağıtılır
  const output = new Array<number>(P).fill(0);
  for (const [a3, provs] of world.byA3) {
    const meta = NE[a3];
    const totalPop = provs.reduce((s, p) => s + pop[p], 0);
    let gdp = meta && meta.gdpMd > 0 ? meta.gdpMd : 0;
    if (gdp <= 0) gdp = (totalPop * 8000) / 1e6;
    const dist = distributeOutput(world, provs, gdp, pop, (p) => (pop[p] > 0 ? Math.min(1, world.data.provinces[p].urban / pop[p]) : 0));
    for (const [p, v] of dist) output[p] = v;
  }
  const byOwner = provincesByOwner(owner);
  const neighbors = ownerNeighbors(world, owner);
  const tags = [...byOwner.keys()].sort((a, b) => byOwner.get(b)!.length - byOwner.get(a)!.length || (a < b ? -1 : 1));
  const colors = assignColors(tags, neighbors);
  const capitals: Record<Tag, number> = {};
  const buildings: number[][] = Array.from({ length: P }, () => BUILDING_IDS.map(() => 0));
  const relIndex = new Map<string, number>();
  for (const [a, b, v] of RELATIONS) relIndex.set(a < b ? `${a}|${b}` : `${b}|${a}`, v);

  const countries: ScenarioCountryDef[] = [];
  for (const tag of tags) {
    const provs = byOwner.get(tag)!;
    const meta = NE[tag];
    const tier = tierOf(meta?.incomeGroup);
    const capital = findCapital(world, provs, tag, pop);
    capitals[tag] = capital;
    const urban = (p: number) => world.data.provinces[p].urban;
    const bmap = defaultBuildings(world, provs, tier, pop, urban, capital, 1);
    for (const [p, arr] of bmap) buildings[p] = arr;
    const techYear = TECH_YEAR[tier];
    const techSet = new Set(TECHS.filter((t) => t.year <= techYear).map((t) => t.id));
    const available = (u: (typeof UNIT_DEFS)[keyof typeof UNIT_DEFS]['id']) => {
      const d = UNIT_DEFS[u];
      if (d.requires && !techSet.has(d.requires)) return false;
      if (d.obsoleteBy && techSet.has(d.obsoleteBy)) return false;
      return true;
    };
    const totalPop = provs.reduce((s, p) => s + pop[p], 0);
    let soldiers = 0;
    if (!NO_ARMY.has(tag)) {
      soldiers = ACTIVE_K[tag] !== undefined ? ACTIVE_K[tag] * 1000 : Math.min(100_000, Math.max(1000, Math.round((totalPop * 0.002) / 1000) * 1000));
      if (totalPop < 100_000) soldiers = 0;
    }
    // Tehditler: ilişkisi en kötü komşular
    const threats = [...(neighbors.get(tag) ?? [])].filter((n) => (relIndex.get(tag < n ? `${tag}|${n}` : `${n}|${tag}`) ?? 0) < -20);
    const armies = placeArmies(world, owner, tag, provs, capital, soldiers, unitMix(tier, available), threats, pop);
    for (const a of armies) {
      const b = buildings[a.province];
      b[6] = Math.max(b[6], 1);
    }
    // Donanma
    const ships = SHIPS[tag] ?? 0;
    if (ships > 0) {
      const coastal = provs.filter((p) => world.coastal[p]);
      if (coastal.length) {
        const port = world.coastal[capital] ? capital : coastal.sort((a, b) => pop[b] - pop[a])[0];
        buildings[port][3] = Math.max(buildings[port][3], 2);
        armies.push({ province: port, units: { navy: ships } });
      }
    }
    const gov = GOV[tag] ?? 'republic';
    let aggression = 0.12 + ((tag.charCodeAt(0) * 7 + tag.charCodeAt(1) * 13 + tag.charCodeAt(2)) % 20) / 100;
    if (gov === 'one_party' || gov === 'theocracy' || gov === 'absolute_monarchy') aggression += 0.08;
    if (gov === 'republic' || gov === 'constitutional_monarchy') aggression -= 0.03;
    const focus: ScenarioCountryDef['focus'] = soldiers > totalPop * 0.006 ? 'military' : tier === 'high' ? 'economy' : 'balanced';
    const policies =
      tier === 'high'
        ? { tax: 3, welfare: 3, education: 2, infrastructure: 2, development: 1, security: 1, military: 2 }
        : tier === 'upper'
          ? { tax: 2, welfare: 2, education: 2, infrastructure: 1, development: 1, security: 1, military: 2 }
          : { tax: 1, welfare: 1, education: 1, infrastructure: 1, development: 1, security: 1, military: 2 };
    countries.push({
      tag,
      name: meta?.nameTr ?? tag,
      nameEn: meta?.name ?? tag,
      flag: CUSTOM_FLAGS[tag] ?? (meta?.iso2 ? meta.iso2.toLowerCase() : 'x-unknown'),
      color: colors.get(tag) ?? [128, 128, 128],
      government: gov,
      techYear,
      armies,
      policies,
      aggression: Math.max(0.02, aggression),
      focus,
      treasuryMonths: tier === 'high' ? 4 : 3,
      claims: tag === 'ARG' ? (world.byA3.get('FLK') ?? []) : undefined,
    });
  }

  // Tartışmalı bölgeler: uluslararası tanınan devletin çekirdeği
  const extraCores: Record<number, Tag[]> = {};
  const addCore = (p: number, t: Tag) => {
    (extraCores[p] ??= []).push(t);
  };
  const crimea = world.idIndex.get('RUS-283');
  if (crimea !== undefined) addCore(crimea, 'UKR');
  for (const p of world.byA3.get('CYN') ?? []) addCore(p, 'CYP');
  for (const p of world.byA3.get('KOS') ?? []) addCore(p, 'SRB');
  for (const p of world.byA3.get('TWN') ?? []) addCore(p, 'CHN');
  for (const p of world.byA3.get('SOL') ?? []) addCore(p, 'SOM');

  const treaties: ScenarioSetup['treaties'] = [];
  const addPairs = (list: Tag[], type: TreatyType) => {
    for (const [a, b] of pairwise(list.filter((t) => byOwner.has(t)))) treaties.push({ type, a, b });
  };
  addPairs([...EU28, ...EEA_PLUS], 'trade');
  for (const eu of EU28) treaties.push({ type: 'trade', a: 'TUR', b: eu }); // AB–Türkiye Gümrük Birliği
  addPairs(['USA', 'CAN', 'MEX'], 'trade');
  addPairs(['ARG', 'BRA', 'PRY', 'URY'], 'trade');
  addPairs(['RUS', 'BLR', 'KAZ', 'ARM', 'KGZ'], 'trade');
  addPairs(['SAU', 'ARE', 'KWT', 'OMN', 'BHR'], 'trade');
  treaties.push({ type: 'trade', a: 'QAT', b: 'KWT' }, { type: 'trade', a: 'QAT', b: 'OMN' });
  addPairs(ASEAN, 'trade');
  for (const a of ASEAN) treaties.push({ type: 'trade', a: 'CHN', b: a });
  treaties.push({ type: 'trade', a: 'AUS', b: 'NZL' }, { type: 'trade', a: 'USA', b: 'KOR' }, { type: 'trade', a: 'TUR', b: 'AZE' }, { type: 'trade', a: 'TUR', b: 'CYN' });
  // İkili savunma anlaşmaları
  for (const [a, b] of [
    ['USA', 'JPN'],
    ['USA', 'KOR'],
    ['USA', 'PHL'],
    ['USA', 'AUS'],
    ['AUS', 'NZL'],
    ['CHN', 'PRK'],
    ['TUR', 'CYN'],
    ['TUR', 'AZE'],
  ] as [Tag, Tag][]) treaties.push({ type: 'defensive', a, b });

  return {
    era: 'modern',
    countries,
    owner,
    extraCores,
    pop,
    output,
    buildings,
    alliances: [
      { name: 'NATO', leader: 'USA', members: NATO.filter((t) => byOwner.has(t)) },
      { name: 'KGAÖ', leader: 'RUS', members: CSTO.filter((t) => byOwner.has(t)) },
    ],
    treaties,
    wars: [],
    relations: RELATIONS.filter(([a, b]) => byOwner.has(a) && byOwner.has(b)),
    capitals,
    popScale: 1,
  };
}

export const MODERN_SCENARIO: ScenarioInfo = {
  id: 'modern',
  year: 2020,
  startDate: '2020-01-01',
  name: { tr: 'Modern Dünya', en: 'Modern World' },
  description: {
    tr: '1 Ocak 2020. Küresel ekonomi birbirine bağlı; NATO ve KGAÖ karşı karşıya, Avrupa Birliği ortak pazarıyla, Asya yükselen güçleriyle sahnede. Tarihin geri kalanını siz yazın.',
    en: '1 January 2020. A deeply connected global economy; NATO and the CSTO face off, the European Union trades as a single market and Asia’s rising powers take the stage. Write the rest of history.',
  },
  available: true,
  sources: {
    tr: 'Sınırlar: Natural Earth v5.1.2 (fiilî kontrol). Nüfus ve GSYH: Natural Earth (Dünya Bankası 2019 tahminleri); bölgesel dağılım tahminidir. Ordular yaklaşık değerlerdir (IISS 2020 düzeyi, yuvarlanmış).',
    en: 'Borders: Natural Earth v5.1.2 (de facto control). Population and GDP: Natural Earth (World Bank 2019 estimates); regional distribution is estimated. Armed forces are approximate (IISS 2020 level, rounded).',
  },
  victory: {
    tr: 'Senaryo hedefi: başlangıçtaki bölge sayınızı iki katına çıkarın ve dünyanın en büyük üç ekonomisinden biri olun.',
    en: 'Scenario goal: double your starting province count and become one of the three largest economies in the world.',
  },
  build: buildModern,
  featured: ['TUR', 'USA', 'CHN', 'RUS', 'DEU', 'GBR', 'FRA', 'IND', 'JPN', 'BRA', 'IRN', 'SAU', 'EGY', 'KOR', 'ITA', 'POL', 'UKR', 'PAK', 'IDN', 'MEX'],
};
