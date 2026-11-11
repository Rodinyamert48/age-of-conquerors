import type { ArmyUnits, Era, GovernmentType, PolicyId, Tag, TreatyType, WarGoal } from '../types';
import type { World } from '../world';

export interface ScenarioCountryDef {
  tag: Tag;
  name: string;
  nameEn: string;
  flag: string;
  color: [number, number, number];
  government: GovernmentType;
  /** bu yıla kadar olan teknolojiler araştırılmış sayılır */
  techYear: number;
  extraTechs?: string[];
  /** başlangıç orduları */
  armies?: { province: number; units: Partial<ArmyUnits>; name?: string }[];
  policies?: Partial<Record<PolicyId, number>>;
  aggression?: number;
  focus?: 'balanced' | 'economy' | 'military';
  /** başlangıçta haritada yok (ilerde kurulabilir) */
  inactive?: boolean;
  treasuryMonths?: number;
  claims?: number[];
}

export interface ScenarioSetup {
  era: Era;
  countries: ScenarioCountryDef[];
  /** bölge başına sahip (tag) */
  owner: Tag[];
  /** bölge başına ek çekirdekler (sahip otomatik çekirdektir) */
  extraCores?: Record<number, Tag[]>;
  /** sömürge bölgeleri: sahibi çekirdek sayılmaz (insan gücüne kısmi katkı, zamanla entegre olur) */
  colonial?: boolean[];
  /** bölge başına nüfus ve yıllık üretim */
  pop: number[];
  output: number[];
  /** bölge başına bina seviyeleri (BUILDING_IDS sırasıyla) */
  buildings: number[][];
  alliances: { name: string; leader: Tag; members: Tag[] }[];
  treaties: { type: TreatyType; a: Tag; b: Tag; years?: number }[];
  wars: { attackers: Tag[]; defenders: Tag[]; goal: WarGoal; name?: string }[];
  /** başlangıç ilişki değerleri (baz ilişkilere eklenir) */
  relations: [Tag, Tag, number][];
  /** bölge başına başkent işareti (ülke başkenti) */
  capitals: Record<Tag, number>;
  /** dönem nüfus ölçeği (bina eşikleri) */
  popScale: number;
}

export interface ScenarioInfo {
  id: string;
  year: number;
  startDate: string;
  name: { tr: string; en: string };
  description: { tr: string; en: string };
  available: boolean;
  /** kullanılamıyorsa nedeni */
  status?: { tr: string; en: string };
  /** veri kaynakları ve doğruluk notu */
  sources: { tr: string; en: string };
  /** senaryoya özgü zafer koşulunun açıklaması */
  victory: { tr: string; en: string };
  build?: (world: World) => ScenarioSetup;
  /** önerilen oynanabilir ülkeler */
  featured: Tag[];
}
