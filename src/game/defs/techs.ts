import type { BuildingId, Modifiers, UnitType } from '../types';

export type TechBranch =
  | 'economy'
  | 'agriculture'
  | 'infrastructure'
  | 'land'
  | 'naval'
  | 'artillery'
  | 'logistics'
  | 'administration'
  | 'diplomacy';

export const TECH_BRANCHES: TechBranch[] = [
  'economy',
  'agriculture',
  'infrastructure',
  'land',
  'naval',
  'artillery',
  'logistics',
  'administration',
  'diplomacy',
];

export interface TechDef {
  id: string;
  branch: TechBranch;
  name: { tr: string; en: string };
  year: number;
  /** temel araştırma maliyeti (araştırma puanı) */
  cost: number;
  mods: Partial<Modifiers>;
  unlockUnits?: UnitType[];
  unlockBuildings?: { id: BuildingId; level: number }[];
}

const t = (
  id: string,
  branch: TechBranch,
  tr: string,
  en: string,
  year: number,
  mods: Partial<Modifiers>,
  extra: Partial<Pick<TechDef, 'unlockUnits' | 'unlockBuildings'>> = {},
): TechDef => ({
  id,
  branch,
  name: { tr, en },
  year,
  // Maliyet dönemle birlikte artar: geç dönem teknolojileri daha pahalıdır
  cost: Math.round(40 + Math.max(0, year - 1400) * 0.12),
  mods,
  ...extra,
});

export const TECHS: TechDef[] = [
  // Ekonomi
  t('e_banking', 'economy', 'Bankacılık', 'Banking', 1450, { taxEfficiency: 0.05 }),
  t('e_mercantilism', 'economy', 'Merkantilizm', 'Mercantilism', 1550, { tradeIncome: 0.1 }),
  t('e_joint_stock', 'economy', 'Anonim Şirketler', 'Joint-Stock Companies', 1650, { productionIncome: 0.1, tradeIncome: 0.05 }, { unlockBuildings: [{ id: 'trade', level: 2 }] }),
  t('e_central_bank', 'economy', 'Merkez Bankacılığı', 'Central Banking', 1750, { taxEfficiency: 0.05, development: 0.002 }),
  t('e_free_trade', 'economy', 'Serbest Ticaret', 'Free Trade', 1840, { tradeIncome: 0.15 }, { unlockBuildings: [{ id: 'trade', level: 3 }] }),
  t('e_industrial_finance', 'economy', 'Sanayi Finansmanı', 'Industrial Finance', 1890, { productionIncome: 0.15 }),
  t('e_keynesian', 'economy', 'Karma Ekonomi', 'Mixed Economy', 1935, { taxEfficiency: 0.05, stability: 3 }),
  t('e_globalization', 'economy', 'Küreselleşme', 'Globalization', 1990, { tradeIncome: 0.2 }),
  t('e_digital_economy', 'economy', 'Dijital Ekonomi', 'Digital Economy', 2015, { productionIncome: 0.1, taxEfficiency: 0.05 }),
  t('e_automation_econ', 'economy', 'Otomasyon Ekonomisi', 'Automated Economy', 2035, { productionIncome: 0.15, development: 0.002 }),

  // Tarım ve üretim
  t('a_three_field', 'agriculture', 'Üç Tarla Sistemi', 'Three-Field System', 1420, { foodOutput: 0.1 }),
  t('a_new_crops', 'agriculture', 'Yeni Dünya Bitkileri', 'New World Crops', 1550, { foodOutput: 0.1, popGrowth: 0.002 }),
  t('a_crop_rotation', 'agriculture', 'Ekim Nöbeti', 'Crop Rotation', 1700, { foodOutput: 0.15 }, { unlockBuildings: [{ id: 'agriculture', level: 2 }] }),
  t('a_mechanized_textiles', 'agriculture', 'Mekanik Dokuma', 'Mechanized Textiles', 1770, { productionIncome: 0.1 }),
  t('a_steam_power', 'agriculture', 'Buhar Gücü', 'Steam Power', 1810, { resourceOutput: 0.15, productionIncome: 0.05 }, { unlockBuildings: [{ id: 'industry', level: 2 }] }),
  t('a_fertilizers', 'agriculture', 'Kimyasal Gübre', 'Chemical Fertilizers', 1900, { foodOutput: 0.2, popGrowth: 0.002 }, { unlockBuildings: [{ id: 'agriculture', level: 3 }] }),
  t('a_assembly_line', 'agriculture', 'Seri Üretim', 'Assembly Line', 1913, { productionIncome: 0.15, buildTime: -0.1 }, { unlockBuildings: [{ id: 'industry', level: 3 }] }),
  t('a_green_revolution', 'agriculture', 'Yeşil Devrim', 'Green Revolution', 1965, { foodOutput: 0.3 }),
  t('a_robotics', 'agriculture', 'Endüstriyel Robotlar', 'Industrial Robotics', 2000, { productionIncome: 0.1, resourceOutput: 0.1 }),
  t('a_vertical_farming', 'agriculture', 'Dikey Tarım', 'Vertical Farming', 2030, { foodOutput: 0.25 }),

  // Altyapı
  t('i_paved_roads', 'infrastructure', 'Taş Yollar', 'Paved Roads', 1450, { moveSpeed: 0.05 }),
  t('i_canals', 'infrastructure', 'Kanallar', 'Canals', 1650, { tradeIncome: 0.05, supply: 0.1 }),
  t('i_turnpikes', 'infrastructure', 'Paralı Yollar', 'Turnpikes', 1750, { moveSpeed: 0.05 }, { unlockBuildings: [{ id: 'road', level: 2 }] }),
  t('i_railways', 'infrastructure', 'Demiryolları', 'Railways', 1830, { moveSpeed: 0.15, supply: 0.2 }, { unlockBuildings: [{ id: 'road', level: 3 }] }),
  t('i_telegraph', 'infrastructure', 'Telgraf', 'Telegraph', 1850, { taxEfficiency: 0.03, recruitTime: -0.1 }),
  t('i_electrification', 'infrastructure', 'Elektrifikasyon', 'Electrification', 1900, { productionIncome: 0.1, development: 0.002 }),
  t('i_highways', 'infrastructure', 'Otoyollar', 'Highways', 1950, { moveSpeed: 0.1, supply: 0.1 }),
  t('i_containerization', 'infrastructure', 'Konteyner Taşımacılığı', 'Containerization', 1970, { tradeIncome: 0.15 }),
  t('i_internet', 'infrastructure', 'İnternet', 'Internet', 1995, { researchSpeed: 0.1, taxEfficiency: 0.03 }),
  t('i_smart_grid', 'infrastructure', 'Akıllı Şebekeler', 'Smart Grids', 2025, { buildCost: -0.1, development: 0.002 }),

  // Kara ordusu
  t('l_pike_shot', 'land', 'Mızrak ve Tüfek', 'Pike and Shot', 1450, { infantryPower: 0.1 }),
  t('l_musketeers', 'land', 'Tüfekçiler', 'Musketeers', 1550, { infantryPower: 0.15 }),
  t('l_bayonet', 'land', 'Süngü', 'Bayonet', 1690, { infantryPower: 0.1, morale: 0.05 }),
  t('l_line_infantry', 'land', 'Hat Piyadesi', 'Line Infantry', 1750, { infantryPower: 0.15, cavalryPower: 0.1 }),
  t('l_rifles', 'land', 'Yivli Tüfekler', 'Rifled Muskets', 1850, { infantryPower: 0.25, lightPower: 0.2 }),
  t('l_machine_guns', 'land', 'Makineli Tüfekler', 'Machine Guns', 1890, { infantryPower: 0.3, fortDefense: 0.1 }, { unlockBuildings: [{ id: 'fort', level: 3 }] }),
  t('l_tanks', 'land', 'Tanklar', 'Tanks', 1916, { armorPower: 0.05 }, { unlockUnits: ['armor'] }),
  t('l_mechanization', 'land', 'Mekanizasyon', 'Mechanization', 1938, { armorPower: 0.2, moveSpeed: 0.1 }),
  t('l_mbt', 'land', 'Ana Muharebe Tankı', 'Main Battle Tank', 1965, { armorPower: 0.3 }),
  t('l_network_warfare', 'land', 'Ağ Merkezli Harp', 'Network-Centric Warfare', 2005, { infantryPower: 0.15, armorPower: 0.15, lightPower: 0.2 }),
  t('l_drones', 'land', 'İnsansız Sistemler', 'Unmanned Systems', 2020, { airPower: 0.25, lightPower: 0.15 }),
  t('l_exoskeleton', 'land', 'Gelecek Piyadesi', 'Future Soldier', 2035, { infantryPower: 0.25 }),

  // Denizcilik
  t('n_carrack', 'naval', 'Karaka', 'Carrack', 1450, { navalPower: 0.1 }),
  t('n_galleon', 'naval', 'Kalyon', 'Galleon', 1550, { navalPower: 0.15, tradeIncome: 0.05 }),
  t('n_ship_of_line', 'naval', 'Hat Gemisi', 'Ship of the Line', 1650, { navalPower: 0.2 }),
  t('n_copper_hull', 'naval', 'Bakır Kaplama', 'Copper Sheathing', 1780, { navalPower: 0.1 }, { unlockBuildings: [{ id: 'port', level: 2 }] }),
  t('n_steamships', 'naval', 'Buharlı Gemiler', 'Steamships', 1830, { navalPower: 0.2, tradeIncome: 0.05 }, { unlockBuildings: [{ id: 'port', level: 3 }] }),
  t('n_ironclads', 'naval', 'Zırhlı Gemiler', 'Ironclads', 1860, { navalPower: 0.25 }),
  t('n_dreadnought', 'naval', 'Drednot', 'Dreadnought', 1906, { navalPower: 0.3 }),
  t('n_carriers', 'naval', 'Uçak Gemileri', 'Aircraft Carriers', 1935, { navalPower: 0.3 }),
  t('n_missiles', 'naval', 'Güdümlü Füze Gemileri', 'Guided Missile Ships', 1965, { navalPower: 0.3 }),
  t('n_aegis', 'naval', 'Entegre Deniz Savunması', 'Integrated Naval Defense', 2000, { navalPower: 0.2 }),
  t('n_unmanned_fleet', 'naval', 'İnsansız Deniz Araçları', 'Unmanned Naval Vessels', 2030, { navalPower: 0.25 }),

  // Topçu ve hava desteği
  t('t_bombards', 'artillery', 'Bombardalar', 'Bombards', 1420, { siegePower: 0.2, siegeSpeed: 0.1 }),
  t('t_field_cannons', 'artillery', 'Sahra Topları', 'Field Cannons', 1500, { artilleryPower: 0.05 }, { unlockUnits: ['artillery'] }),
  t('t_standard_calibers', 'artillery', 'Standart Kalibreler', 'Standard Calibers', 1740, { artilleryPower: 0.2 }),
  t('t_horse_artillery', 'artillery', 'Atlı Topçu', 'Horse Artillery', 1790, { artilleryPower: 0.1, moveSpeed: 0.03 }),
  t('t_breech_loading', 'artillery', 'Kuyruktan Dolma Toplar', 'Breech-Loading Guns', 1860, { artilleryPower: 0.25, siegePower: 0.2, siegeSpeed: 0.1 }),
  t('t_aviation', 'artillery', 'Askerî Havacılık', 'Military Aviation', 1912, { airPower: 0.05 }, { unlockUnits: ['air'] }),
  t('t_heavy_howitzers', 'artillery', 'Ağır Obüsler', 'Heavy Howitzers', 1914, { artilleryPower: 0.2, siegePower: 0.3, siegeSpeed: 0.15 }),
  t('t_self_propelled', 'artillery', 'Kundağı Motorlu Toplar', 'Self-Propelled Guns', 1942, { artilleryPower: 0.2, siegeSpeed: 0.2 }),
  t('t_jets', 'artillery', 'Jet Uçakları', 'Jet Aircraft', 1950, { airPower: 0.4 }),
  t('t_precision', 'artillery', 'Hassas Güdümlü Mühimmat', 'Precision-Guided Munitions', 1991, { artilleryPower: 0.25, airPower: 0.25 }),
  t('t_stealth', 'artillery', 'Hayalet Teknolojisi', 'Stealth Technology', 2010, { airPower: 0.3 }),
  t('t_hypersonic', 'artillery', 'Hipersonik Füzeler', 'Hypersonic Missiles', 2030, { artilleryPower: 0.3, siegeSpeed: 0.2 }),

  // Lojistik
  t('g_supply_trains', 'logistics', 'İkmal Kolları', 'Supply Trains', 1450, { supply: 0.1 }),
  t('g_magazines', 'logistics', 'Cephanelik Sistemi', 'Magazine System', 1650, { supply: 0.1, attrition: -0.1 }, { unlockBuildings: [{ id: 'fort', level: 2 }] }),
  t('g_division_system', 'logistics', 'Tümen Sistemi', 'Divisional System', 1790, { moveSpeed: 0.05, morale: 0.05 }),
  t('g_canned_food', 'logistics', 'Konserve Gıda', 'Canned Food', 1810, { attrition: -0.15 }),
  t('g_military_railways', 'logistics', 'Askerî Demiryolları', 'Military Railways', 1860, { moveSpeed: 0.1, recruitTime: -0.1 }),
  t('g_motor_transport', 'logistics', 'Motorlu Nakliye', 'Motor Transport', 1920, { supply: 0.2, moveSpeed: 0.1 }),
  t('g_air_supply', 'logistics', 'Hava İkmali', 'Air Supply', 1945, { supply: 0.15, attrition: -0.15 }),
  t('g_modern_logistics', 'logistics', 'Modern Lojistik', 'Modern Logistics', 1980, { supply: 0.2, recruitCost: -0.1 }),
  t('g_satellite', 'logistics', 'Uydu Lojistiği', 'Satellite Logistics', 2005, { moveSpeed: 0.1, supply: 0.1 }),
  t('g_autonomous', 'logistics', 'Otonom Lojistik', 'Autonomous Logistics', 2030, { attrition: -0.2, upkeep: -0.1 }),

  // Yönetim
  t('m_bureaucracy', 'administration', 'Bürokrasi', 'Bureaucracy', 1450, { taxEfficiency: 0.05 }),
  t('m_printing', 'administration', 'Matbaa', 'Printing Press', 1460, { researchSpeed: 0.1 }, { unlockBuildings: [{ id: 'university', level: 1 }] }),
  t('m_standing_army', 'administration', 'Daimi Ordu', 'Standing Army', 1550, { manpower: 0.1, upkeep: -0.05 }, { unlockBuildings: [{ id: 'military', level: 2 }] }),
  t('m_absolutism', 'administration', 'Merkezî Yönetim', 'Centralization', 1650, { stability: 3, unrest: -3 }),
  t('m_census', 'administration', 'Nüfus Sayımı', 'Census', 1790, { taxEfficiency: 0.05, manpower: 0.1 }),
  t('m_conscription', 'administration', 'Zorunlu Askerlik', 'Conscription', 1800, { manpower: 0.4 }, { unlockBuildings: [{ id: 'military', level: 3 }] }),
  t('m_public_education', 'administration', 'Kamu Eğitimi', 'Public Education', 1870, { researchSpeed: 0.15 }, { unlockBuildings: [{ id: 'university', level: 2 }] }),
  t('m_civil_service', 'administration', 'Modern Kamu Hizmeti', 'Civil Service', 1900, { taxEfficiency: 0.05, stability: 3 }),
  t('m_welfare_state', 'administration', 'Sosyal Devlet', 'Welfare State', 1945, { stability: 5, popGrowth: 0.001 }),
  t('m_e_government', 'administration', 'E-Devlet', 'E-Government', 2005, { taxEfficiency: 0.05, unrest: -3 }),
  t('m_ai_governance', 'administration', 'Yapay Zekâ Destekli Yönetim', 'AI-Assisted Governance', 2030, { researchSpeed: 0.15, taxEfficiency: 0.05 }),

  // Diplomasi
  t('d_resident_embassies', 'diplomacy', 'Daimi Elçilikler', 'Resident Embassies', 1450, { relationGain: 0.15 }),
  t('d_protocol', 'diplomacy', 'Diplomatik Protokol', 'Diplomatic Protocol', 1520, { acceptance: 3 }),
  t('d_balance_power', 'diplomacy', 'Güç Dengesi', 'Balance of Power', 1650, { acceptance: 5 }),
  t('d_congress_system', 'diplomacy', 'Kongre Sistemi', 'Congress System', 1815, { relationGain: 0.15, warExhaustion: -0.1 }),
  t('d_international_law', 'diplomacy', 'Uluslararası Hukuk', 'International Law', 1860, { acceptance: 5 }),
  t('d_collective_security', 'diplomacy', 'Kolektif Güvenlik', 'Collective Security', 1920, { acceptance: 5, relationGain: 0.1 }),
  t('d_international_orgs', 'diplomacy', 'Uluslararası Kuruluşlar', 'International Organizations', 1945, { tradeIncome: 0.05, acceptance: 5 }),
  t('d_soft_power', 'diplomacy', 'Yumuşak Güç', 'Soft Power', 1990, { relationGain: 0.25 }),
  t('d_digital_diplomacy', 'diplomacy', 'Dijital Diplomasi', 'Digital Diplomacy', 2015, { acceptance: 5 }),
  t('d_global_governance', 'diplomacy', 'Küresel Yönetişim', 'Global Governance', 2035, { acceptance: 5, warExhaustion: -0.1 }),
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((x) => [x.id, x]));

/** Bir dalda önceki teknoloji (aynı dalda yıl sırasına göre) */
export const TECH_PREREQ: Record<string, string | null> = (() => {
  const out: Record<string, string | null> = {};
  for (const b of TECH_BRANCHES) {
    const list = TECHS.filter((x) => x.branch === b).sort((a, c) => a.year - c.year);
    list.forEach((x, i) => (out[x.id] = i > 0 ? list[i - 1].id : null));
  }
  return out;
})();

export function techsUpToYear(year: number): string[] {
  return TECHS.filter((x) => x.year <= year).map((x) => x.id);
}
