/**
 * 1914 — Büyük Savaş (4 Ağustos 1914).
 *
 * Yöntem ve kaynaklar:
 *  - Sınırlar: 1914 siyasi sınırları, Natural Earth admin-1 birimleri üzerinden bölge düzeyinde eşlenmiştir
 *    (genel tarih atlası bilgisi). Birden çok idari birim içeren oyun bölgelerinde çoğunluk kuralı uygulanır;
 *    bu yüzden Trentino, Trieste, Kuzey Schleswig, Batı Trakya, Güney Dobruca ve Kuzey Bukovina'nın bir kısmı
 *    gibi küçük alanlar komşu bölgeleriyle birlikte tek bir sahipte görünür.
 *  - Nüfus: 2020 bölge nüfusları, ülke bazında yaklaşık 1913/2020 oranlarıyla ölçeklenir
 *    (Maddison Project Database düzeyindeki yuvarlanmış 1913 nüfus tahminleri).
 *  - Üretim: 1913 kişi başı GSYH yaklaşık değerleri (Maddison Project, 1990 uluslararası doları, yuvarlanmış).
 *  - Ordular: 4 Ağustos 1914'te seferberlik sürerken cephelerdeki yaklaşık kuvvetler; donanmalar başlıca
 *    savaş gemilerinin göreli büyüklüğünü yansıtan oyun birimleridir. Kesin değer iddiası taşımaz.
 *  - Bloklar: Almanya ile Avusturya-Macaristan (İkili İttifak) ve Fransa–Rusya–Birleşik Krallık (İtilaf).
 *    İtalya 2 Ağustos 1914'te tarafsızlığını ilan ettiği için başlangıçta hiçbir bloğa bağlı değildir.
 *    Osmanlı–Alman gizli antlaşması (2 Ağustos 1914) ve sonraki savaşa girişler tarihî olaylarla gelir.
 */
import type { ArmyUnits, GovernmentType, PolicyId, Tag, UnitType } from '../types';
import { BUILDING_IDS } from '../types';
import type { World } from '../world';
import type { ScenarioCountryDef, ScenarioInfo, ScenarioSetup } from './types';
import neCountriesJson from '../../data/generated/ne-countries.json';
import regionsJson from '../../data/generated/province-regions.json';
import { assignColors } from './colors';
import { defaultBuildings, distributeOutput, findCapital, ownerNeighbors, placeArmies, provincesByOwner, type IncomeTier } from './common';
import { UNIT_DEFS } from '../defs/units';
import { TECHS } from '../defs/techs';
import { BUILDING_DEFS } from '../defs/buildings';

const REGIONS = regionsJson as string[][];
const NE = neCountriesJson as unknown as Record<string, { continent?: string }>;

// ---------------------------------------------------------------------------
// Ülkeler
// ---------------------------------------------------------------------------
interface CountryInfo {
  name: string;
  nameEn: string;
  flag: string;
  gov: GovernmentType;
  techYear: number;
  aggression?: number;
  /** başlangıçta yok: bağımsızlık hareketiyle ya da barışla kurulabilir */
  inactive?: boolean;
}

const CM: GovernmentType = 'constitutional_monarchy';
const AM: GovernmentType = 'absolute_monarchy';
const RP: GovernmentType = 'republic';

export const COUNTRIES_1914: Record<Tag, CountryInfo> = {
  // Avrupa
  GBR: { name: 'Birleşik Krallık', nameEn: 'United Kingdom', flag: 'gb', gov: CM, techYear: 1914, aggression: 0.2 },
  FRA: { name: 'Fransa', nameEn: 'France', flag: 'fr', gov: RP, techYear: 1914, aggression: 0.25 },
  DEU: { name: 'Alman İmparatorluğu', nameEn: 'German Empire', flag: 'x-german-empire', gov: CM, techYear: 1914, aggression: 0.45 },
  AUH: { name: 'Avusturya-Macaristan', nameEn: 'Austria-Hungary', flag: 'x-austria-hungary', gov: CM, techYear: 1910, aggression: 0.35 },
  RUS: { name: 'Rus İmparatorluğu', nameEn: 'Russian Empire', flag: 'ru', gov: AM, techYear: 1905, aggression: 0.3 },
  ITA: { name: 'İtalya Krallığı', nameEn: 'Kingdom of Italy', flag: 'x-kingdom-of-italy', gov: CM, techYear: 1910, aggression: 0.3 },
  ESP: { name: 'İspanya', nameEn: 'Spain', flag: 'es', gov: CM, techYear: 1900 },
  PRT: { name: 'Portekiz', nameEn: 'Portugal', flag: 'pt', gov: RP, techYear: 1895 },
  NLD: { name: 'Hollanda', nameEn: 'Netherlands', flag: 'nl', gov: CM, techYear: 1910, aggression: 0.08 },
  BEL: { name: 'Belçika', nameEn: 'Belgium', flag: 'be', gov: CM, techYear: 1910, aggression: 0.08 },
  LUX: { name: 'Lüksemburg', nameEn: 'Luxembourg', flag: 'lu', gov: CM, techYear: 1905, aggression: 0.05 },
  CHE: { name: 'İsviçre', nameEn: 'Switzerland', flag: 'ch', gov: RP, techYear: 1910, aggression: 0.05 },
  DNK: { name: 'Danimarka', nameEn: 'Denmark', flag: 'dk', gov: CM, techYear: 1910, aggression: 0.08 },
  NOR: { name: 'Norveç', nameEn: 'Norway', flag: 'no', gov: CM, techYear: 1905, aggression: 0.08 },
  SWE: { name: 'İsveç', nameEn: 'Sweden', flag: 'se', gov: CM, techYear: 1910, aggression: 0.1 },
  SRB: { name: 'Sırbistan Krallığı', nameEn: 'Kingdom of Serbia', flag: 'rs', gov: CM, techYear: 1895, aggression: 0.3 },
  MNE: { name: 'Karadağ Krallığı', nameEn: 'Kingdom of Montenegro', flag: 'x-montenegro-1914', gov: CM, techYear: 1880, aggression: 0.25 },
  BGR: { name: 'Bulgaristan Çarlığı', nameEn: 'Tsardom of Bulgaria', flag: 'bg', gov: CM, techYear: 1900, aggression: 0.35 },
  ROU: { name: 'Romanya Krallığı', nameEn: 'Kingdom of Romania', flag: 'ro', gov: CM, techYear: 1900, aggression: 0.25 },
  GRC: { name: 'Yunanistan Krallığı', nameEn: 'Kingdom of Greece', flag: 'gr', gov: CM, techYear: 1900, aggression: 0.25 },
  ALB: { name: 'Arnavutluk Prensliği', nameEn: 'Principality of Albania', flag: 'al', gov: CM, techYear: 1880, aggression: 0.1 },
  AND: { name: 'Andorra', nameEn: 'Andorra', flag: 'ad', gov: CM, techYear: 1890, aggression: 0.02 },
  MCO: { name: 'Monako', nameEn: 'Monaco', flag: 'mc', gov: CM, techYear: 1905, aggression: 0.02 },
  LIE: { name: 'Lihtenştayn', nameEn: 'Liechtenstein', flag: 'li', gov: CM, techYear: 1905, aggression: 0.02 },
  SMR: { name: 'San Marino', nameEn: 'San Marino', flag: 'sm', gov: RP, techYear: 1900, aggression: 0.02 },
  // Orta Doğu ve Asya
  OTT: { name: 'Osmanlı İmparatorluğu', nameEn: 'Ottoman Empire', flag: 'tr', gov: CM, techYear: 1895, aggression: 0.3 },
  PRS: { name: 'İran (Kaçar Devleti)', nameEn: 'Persia (Qajar State)', flag: 'x-qajar-persia', gov: CM, techYear: 1870, aggression: 0.1 },
  AFG: { name: 'Afganistan Emirliği', nameEn: 'Emirate of Afghanistan', flag: 'x-unknown', gov: AM, techYear: 1850, aggression: 0.2 },
  NJD: { name: 'Necid ve Hasa Emirliği', nameEn: 'Emirate of Nejd and Hasa', flag: 'x-unknown', gov: AM, techYear: 1820, aggression: 0.4 },
  SHM: { name: 'Cebel-i Şammar Emirliği', nameEn: 'Emirate of Jabal Shammar', flag: 'x-unknown', gov: AM, techYear: 1820, aggression: 0.3 },
  OMN: { name: 'Maskat ve Umman Sultanlığı', nameEn: 'Sultanate of Muscat and Oman', flag: 'x-plain-red', gov: AM, techYear: 1840, aggression: 0.1 },
  KWT: { name: 'Kuveyt Şeyhliği', nameEn: 'Sheikhdom of Kuwait', flag: 'x-plain-red', gov: AM, techYear: 1840, aggression: 0.05 },
  BHR: { name: 'Bahreyn', nameEn: 'Bahrain', flag: 'bh', gov: AM, techYear: 1840, aggression: 0.05 },
  ARE: { name: 'Sahil Şeyhlikleri', nameEn: 'Trucial States', flag: 'x-trucial-states', gov: AM, techYear: 1840, aggression: 0.05 },
  CHN: { name: 'Çin Cumhuriyeti', nameEn: 'Republic of China', flag: 'x-roc-five-colors', gov: RP, techYear: 1880, aggression: 0.15 },
  TIB: { name: 'Tibet', nameEn: 'Tibet', flag: 'x-tibet', gov: 'theocracy', techYear: 1750, aggression: 0.05 },
  MNG: { name: 'Moğolistan (Bogd Hanlığı)', nameEn: 'Mongolia (Bogd Khanate)', flag: 'x-unknown', gov: 'theocracy', techYear: 1750, aggression: 0.1 },
  JPN: { name: 'Japonya İmparatorluğu', nameEn: 'Empire of Japan', flag: 'jp', gov: CM, techYear: 1910, aggression: 0.4 },
  THA: { name: 'Siyam Krallığı', nameEn: 'Kingdom of Siam', flag: 'x-siam', gov: AM, techYear: 1880, aggression: 0.1 },
  NPL: { name: 'Nepal Krallığı', nameEn: 'Kingdom of Nepal', flag: 'np', gov: AM, techYear: 1820, aggression: 0.1 },
  BTN: { name: 'Butan', nameEn: 'Bhutan', flag: 'bt', gov: AM, techYear: 1800, aggression: 0.05 },
  // Afrika
  EGY: { name: 'Mısır Hidivliği', nameEn: 'Khedivate of Egypt', flag: 'x-khedivate-egypt', gov: AM, techYear: 1880, aggression: 0.1 },
  ETH: { name: 'Habeşistan İmparatorluğu', nameEn: 'Ethiopian Empire', flag: 'x-ethiopian-empire', gov: AM, techYear: 1850, aggression: 0.2 },
  LBR: { name: 'Liberya', nameEn: 'Liberia', flag: 'lr', gov: RP, techYear: 1870, aggression: 0.05 },
  ZAF: { name: 'Güney Afrika Birliği', nameEn: 'Union of South Africa', flag: 'x-red-ensign-sa', gov: CM, techYear: 1905, aggression: 0.15 },
  // Amerika
  USA: { name: 'Amerika Birleşik Devletleri', nameEn: 'United States', flag: 'us', gov: RP, techYear: 1914, aggression: 0.12 },
  CAN: { name: 'Kanada', nameEn: 'Canada', flag: 'x-red-ensign-ca', gov: CM, techYear: 1910, aggression: 0.1 },
  NFL: { name: 'Newfoundland', nameEn: 'Newfoundland', flag: 'x-red-ensign', gov: CM, techYear: 1905, aggression: 0.05 },
  MEX: { name: 'Meksika', nameEn: 'Mexico', flag: 'mx', gov: RP, techYear: 1890, aggression: 0.15 },
  GTM: { name: 'Guatemala', nameEn: 'Guatemala', flag: 'gt', gov: RP, techYear: 1880 },
  HND: { name: 'Honduras', nameEn: 'Honduras', flag: 'hn', gov: RP, techYear: 1880 },
  SLV: { name: 'El Salvador', nameEn: 'El Salvador', flag: 'sv', gov: RP, techYear: 1880 },
  NIC: { name: 'Nikaragua', nameEn: 'Nicaragua', flag: 'ni', gov: RP, techYear: 1880 },
  CRI: { name: 'Kosta Rika', nameEn: 'Costa Rica', flag: 'cr', gov: RP, techYear: 1885 },
  PAN: { name: 'Panama', nameEn: 'Panama', flag: 'pa', gov: RP, techYear: 1885 },
  CUB: { name: 'Küba', nameEn: 'Cuba', flag: 'cu', gov: RP, techYear: 1890 },
  HTI: { name: 'Haiti', nameEn: 'Haiti', flag: 'ht', gov: RP, techYear: 1870 },
  DOM: { name: 'Dominik Cumhuriyeti', nameEn: 'Dominican Republic', flag: 'do', gov: RP, techYear: 1870 },
  COL: { name: 'Kolombiya', nameEn: 'Colombia', flag: 'co', gov: RP, techYear: 1885 },
  VEN: { name: 'Venezuela', nameEn: 'Venezuela', flag: 've', gov: RP, techYear: 1885 },
  ECU: { name: 'Ekvador', nameEn: 'Ecuador', flag: 'ec', gov: RP, techYear: 1880 },
  PER: { name: 'Peru', nameEn: 'Peru', flag: 'pe', gov: RP, techYear: 1885 },
  BOL: { name: 'Bolivya', nameEn: 'Bolivia', flag: 'bo', gov: RP, techYear: 1880 },
  CHL: { name: 'Şili', nameEn: 'Chile', flag: 'cl', gov: RP, techYear: 1900, aggression: 0.15 },
  ARG: { name: 'Arjantin', nameEn: 'Argentina', flag: 'ar', gov: RP, techYear: 1900, aggression: 0.12 },
  URY: { name: 'Uruguay', nameEn: 'Uruguay', flag: 'uy', gov: RP, techYear: 1900 },
  PRY: { name: 'Paraguay', nameEn: 'Paraguay', flag: 'py', gov: RP, techYear: 1880 },
  BRA: { name: 'Brezilya', nameEn: 'Brazil', flag: 'br', gov: RP, techYear: 1895, aggression: 0.12 },
  // Okyanusya
  AUS: { name: 'Avustralya', nameEn: 'Australia', flag: 'au', gov: CM, techYear: 1910, aggression: 0.1 },
  NZL: { name: 'Yeni Zelanda', nameEn: 'New Zealand', flag: 'nz', gov: CM, techYear: 1910, aggression: 0.1 },
  // Başlangıçta var olmayan uluslar (bağımsızlık hareketleri, barış koşulları ve olaylarla kurulabilir)
  POL: { name: 'Polonya', nameEn: 'Poland', flag: 'pl', gov: RP, techYear: 1905, inactive: true },
  FIN: { name: 'Finlandiya', nameEn: 'Finland', flag: 'fi', gov: RP, techYear: 1905, inactive: true },
  EST: { name: 'Estonya', nameEn: 'Estonia', flag: 'ee', gov: RP, techYear: 1900, inactive: true },
  LVA: { name: 'Letonya', nameEn: 'Latvia', flag: 'lv', gov: RP, techYear: 1900, inactive: true },
  LTU: { name: 'Litvanya', nameEn: 'Lithuania', flag: 'lt', gov: RP, techYear: 1900, inactive: true },
  UKR: { name: 'Ukrayna', nameEn: 'Ukraine', flag: 'ua', gov: RP, techYear: 1900, inactive: true },
  BLR: { name: 'Beyaz Rusya', nameEn: 'Belarus', flag: 'x-unknown', gov: RP, techYear: 1895, inactive: true },
  GEO: { name: 'Gürcistan', nameEn: 'Georgia', flag: 'x-unknown', gov: RP, techYear: 1895, inactive: true },
  ARM: { name: 'Ermenistan', nameEn: 'Armenia', flag: 'x-unknown', gov: RP, techYear: 1895, inactive: true },
  AZE: { name: 'Azerbaycan', nameEn: 'Azerbaijan', flag: 'x-unknown', gov: RP, techYear: 1895, inactive: true },
  IRL: { name: 'İrlanda', nameEn: 'Ireland', flag: 'ie', gov: RP, techYear: 1905, inactive: true },
  ISL: { name: 'İzlanda', nameEn: 'Iceland', flag: 'is', gov: CM, techYear: 1905, inactive: true },
  CSK: { name: 'Çekoslovakya', nameEn: 'Czechoslovakia', flag: 'cz', gov: RP, techYear: 1905, inactive: true },
  HUN: { name: 'Macaristan', nameEn: 'Hungary', flag: 'hu', gov: CM, techYear: 1905, inactive: true },
  HRV: { name: 'Hırvatistan', nameEn: 'Croatia', flag: 'x-unknown', gov: CM, techYear: 1900, inactive: true },
  SVN: { name: 'Slovenya', nameEn: 'Slovenia', flag: 'x-unknown', gov: RP, techYear: 1900, inactive: true },
  BIH: { name: 'Bosna', nameEn: 'Bosnia', flag: 'x-unknown', gov: RP, techYear: 1890, inactive: true },
  HEJ: { name: 'Hicaz Krallığı', nameEn: 'Kingdom of Hejaz', flag: 'x-hejaz', gov: AM, techYear: 1850, inactive: true },
  SYR: { name: 'Suriye', nameEn: 'Syria', flag: 'x-unknown', gov: CM, techYear: 1880, inactive: true },
  IRQ: { name: 'Irak', nameEn: 'Iraq', flag: 'x-unknown', gov: CM, techYear: 1880, inactive: true },
  KOR: { name: 'Kore', nameEn: 'Korea', flag: 'kr', gov: RP, techYear: 1895, inactive: true },
  IND: { name: 'Hindistan', nameEn: 'India', flag: 'x-unknown', gov: RP, techYear: 1890, inactive: true },
  PHL: { name: 'Filipinler', nameEn: 'Philippines', flag: 'ph', gov: RP, techYear: 1890, inactive: true },
};

// ---------------------------------------------------------------------------
// Sınırlar
// ---------------------------------------------------------------------------
/** Modern ülke kodu → 1914 sahibi (varsayılan) */
const OWN: Record<string, Tag> = {
  // Avrupa
  GBR: 'GBR', IRL: 'GBR', IMN: 'GBR', JEY: 'GBR', GGY: 'GBR', GIB: 'GBR', MLT: 'GBR', CYP: 'GBR', CYN: 'GBR',
  FRA: 'FRA', MCO: 'MCO', AND: 'AND', LIE: 'LIE', SMR: 'SMR',
  DEU: 'DEU', AUT: 'AUH', HUN: 'AUH', CZE: 'AUH', SVK: 'AUH', SVN: 'AUH', HRV: 'AUH', BIH: 'AUH',
  POL: 'RUS', RUS: 'RUS', FIN: 'RUS', ALD: 'RUS', EST: 'RUS', LVA: 'RUS', LTU: 'RUS', BLR: 'RUS', UKR: 'RUS', MDA: 'RUS',
  GEO: 'RUS', ARM: 'RUS', AZE: 'RUS', KAZ: 'RUS', UZB: 'RUS', TKM: 'RUS', KGZ: 'RUS', TJK: 'RUS',
  ITA: 'ITA', ESP: 'ESP', PRT: 'PRT', NLD: 'NLD', BEL: 'BEL', LUX: 'LUX', CHE: 'CHE',
  DNK: 'DNK', ISL: 'DNK', FRO: 'DNK', GRL: 'DNK', NOR: 'NOR', SWE: 'SWE',
  SRB: 'SRB', KOS: 'SRB', MKD: 'SRB', MNE: 'MNE', BGR: 'BGR', ROU: 'ROU', GRC: 'GRC', ALB: 'ALB',
  // Orta Doğu
  TUR: 'OTT', SYR: 'OTT', LBN: 'OTT', ISR: 'OTT', PSX: 'OTT', JOR: 'OTT', IRQ: 'OTT', QAT: 'OTT', SAU: 'OTT', YEM: 'OTT',
  KWT: 'KWT', BHR: 'BHR', ARE: 'ARE', OMN: 'OMN', IRN: 'PRS', AFG: 'AFG',
  // Asya
  IND: 'GBR', PAK: 'GBR', BGD: 'GBR', MMR: 'GBR', LKA: 'GBR', MDV: 'GBR', MYS: 'GBR', SGP: 'GBR', BRN: 'GBR', HKG: 'GBR',
  NPL: 'NPL', BTN: 'BTN', CHN: 'CHN', MAC: 'PRT', TWN: 'JPN', MNG: 'MNG', JPN: 'JPN', KOR: 'JPN', PRK: 'JPN',
  THA: 'THA', VNM: 'FRA', LAO: 'FRA', KHM: 'FRA', PHL: 'USA', IDN: 'NLD', TLS: 'PRT',
  // Afrika
  EGY: 'EGY', SDN: 'GBR', SDS: 'GBR', LBY: 'ITA', TUN: 'FRA', DZA: 'FRA', MAR: 'FRA', SAH: 'ESP',
  MRT: 'FRA', SEN: 'FRA', GMB: 'GBR', GNB: 'PRT', GIN: 'FRA', SLE: 'GBR', LBR: 'LBR', CIV: 'FRA', GHA: 'GBR', TGO: 'DEU',
  BEN: 'FRA', NGA: 'GBR', NER: 'FRA', MLI: 'FRA', BFA: 'FRA', TCD: 'FRA', CMR: 'DEU', CAF: 'FRA', GNQ: 'ESP', GAB: 'FRA',
  COG: 'FRA', COD: 'BEL', AGO: 'PRT', NAM: 'DEU', ZAF: 'ZAF', BWA: 'GBR', LSO: 'GBR', SWZ: 'GBR', ZWE: 'GBR', ZMB: 'GBR',
  MWI: 'GBR', MOZ: 'PRT', TZA: 'DEU', RWA: 'DEU', BDI: 'DEU', UGA: 'GBR', KEN: 'GBR', ETH: 'ETH', ERI: 'ITA', DJI: 'FRA',
  SOM: 'ITA', SOL: 'GBR', MDG: 'FRA', COM: 'FRA', MUS: 'GBR', SYC: 'GBR', CPV: 'PRT', STP: 'PRT',
  // Amerika
  USA: 'USA', PRI: 'USA', GUM: 'USA', ASM: 'USA', VIR: 'DNK', CAN: 'CAN', MEX: 'MEX', GTM: 'GTM', BLZ: 'GBR', HND: 'HND',
  SLV: 'SLV', NIC: 'NIC', CRI: 'CRI', PAN: 'PAN', CUB: 'CUB', JAM: 'GBR', HTI: 'HTI', DOM: 'DOM', BHS: 'GBR', BRB: 'GBR',
  TTO: 'GBR', ATG: 'GBR', KNA: 'GBR', LCA: 'GBR', VCT: 'GBR', GRD: 'GBR', DMA: 'GBR', BMU: 'GBR', CYM: 'GBR', VGB: 'GBR',
  AIA: 'GBR', TCA: 'GBR', FLK: 'GBR', CUW: 'NLD', ABW: 'NLD', SXM: 'NLD', MAF: 'FRA', BLM: 'FRA', SPM: 'FRA', GUY: 'GBR',
  SUR: 'NLD', COL: 'COL', VEN: 'VEN', ECU: 'ECU', PER: 'PER', BOL: 'BOL', CHL: 'CHL', ARG: 'ARG', URY: 'URY', PRY: 'PRY',
  BRA: 'BRA',
  // Okyanusya
  AUS: 'AUS', NZL: 'NZL', COK: 'NZL', PNG: 'DEU', FJI: 'GBR', SLB: 'GBR', VUT: 'GBR', NCL: 'FRA', PYF: 'FRA', WLF: 'FRA',
  WSM: 'DEU', TON: 'GBR', KIR: 'GBR', TUV: 'GBR', NRU: 'DEU', PLW: 'DEU', FSM: 'DEU', MHL: 'DEU', MNP: 'DEU',
};

/** İdari birim (admin-1) düzeyinde istisnalar: modern ülke → birim adı → 1914 sahibi */
const REGION_OWN: Record<string, Record<string, Tag>> = {
  // Alsas-Loren
  FRA: { 'Bas-Rhin': 'DEU', 'Haut-Rhin': 'DEU', Moselle: 'DEU' },
  // Prusya ve Silezya Almanya'da, Galiçya Avusturya'da, Kongre Polonyası Rusya'da
  POL: {
    'Warmian-Masurian Voivodeship': 'DEU',
    'Pomeranian Voivodeship': 'DEU',
    'West Pomeranian Voivodeship': 'DEU',
    'Lubusz Voivodeship': 'DEU',
    'Greater Poland Voivodeship': 'DEU',
    'Kuyavian-Pomeranian Voivodeship': 'DEU',
    'Lower Silesian Voivodeship': 'DEU',
    'Opole Voivodeship': 'DEU',
    'Silesian Voivodeship': 'DEU',
    'Lesser Poland Voivodeship': 'AUH',
    'Podkarpackie Voivodeship': 'AUH',
  },
  // Doğu Prusya (Königsberg)
  RUS: { Kaliningrad: 'DEU' },
  // Memel bölgesi
  LTU: { Klaipėda: 'DEU' },
  // Doğu Galiçya, Bukovina, Karpat Ötesi
  UKR: { Lviv: 'AUH', 'Ivano-Frankivsk': 'AUH', Ternopil: 'AUH', Chernivtsi: 'AUH', Zakarpattia: 'AUH' },
  // Transilvanya, Banat, Krişana, Maramureş ve Güney Bukovina
  ROU: {
    Alba: 'AUH', Arad: 'AUH', Bihor: 'AUH', 'Bistrița-Năsăud': 'AUH', Brașov: 'AUH', 'Caraș-Severin': 'AUH', Cluj: 'AUH',
    Covasna: 'AUH', Harghita: 'AUH', Hunedoara: 'AUH', Maramureș: 'AUH', Mureș: 'AUH', 'Satu Mare': 'AUH', Sălaj: 'AUH',
    Sibiu: 'AUH', Timiș: 'AUH', Suceava: 'AUH',
  },
  // Voyvodina
  SRB: { 'North Bačka': 'AUH', 'West Bačka': 'AUH', 'South Bačka': 'AUH', 'North Banat': 'AUH', 'Central Banat': 'AUH', 'South Banat': 'AUH', Srem: 'AUH' },
  // Kars, Ardahan, Batum (1878–1918 Rus yönetimi) ve Iğdır
  TUR: { Kars: 'RUS', Ardahan: 'RUS', Artvin: 'RUS', Iğdır: 'RUS' },
  // Necid ve Hasa (1913'te Hasa'nın alınmasıyla), Cebel-i Şammar; Hicaz ve Asir Osmanlı
  SAU: { Riyadh: 'NJD', Eastern: 'NJD', 'Al-Qassim': 'NJD', "Ha'il": 'SHM', 'Northern Borders': 'SHM', 'Al-Jowf': 'SHM' },
  // Aden ve Aden Koruma Bölgesi (İngiliz); kuzey Yemen Osmanlı
  YEM: { "'Adan": 'GBR', Lahij: 'GBR', Abyan: 'GBR', Shabwah: 'GBR', Hadhramaut: 'GBR', 'Al Mahrah': 'GBR' },
  // 1913'ten beri fiilen bağımsız Tibet
  CHN: { Tibet: 'TIB' },
  // İspanyol Fas bölgesi ve İspanyol Sahrası
  MAR: { 'Tangier-Tetouan': 'ESP', 'Taza-Al Hoceïma-Taounate': 'ESP', 'Laâyoune-Boujdour-Sakia El Hamra': 'ESP', 'Oued Ed-Dahab': 'ESP' },
  // Newfoundland ayrı bir dominyondu
  CAN: { 'Newfoundland and Labrador': 'NFL' },
  // Papua (Avustralya yönetimi); kuzey Yeni Gine Alman
  PNG: { Gulf: 'AUS', Western: 'AUS', Central: 'AUS', 'Port Moresby': 'AUS', Oro: 'AUS', 'Milne Bay': 'AUS', 'Southern Highlands': 'AUS', Enga: 'AUS' },
};

/** Çoğunluk kuralının yetmediği (eşit bölünmüş) bölgeler için açık kararlar */
const PROVINCE_OWN: Record<string, Tag> = {
  'POL-3170': 'AUH', // Kraków: Küçük Polonya (Avusturya) + Świętokrzyskie (Rusya); Krakow ve nüfus çoğunluğu Galiçya'da
  'UKR-286': 'RUS', // Rivne + Ternopil: Volhinya (Rusya) bölge merkezinde
  'MAR-3457-2': 'ESP', // Tarfaya şeridi (Cape Juby)
};

/** Başlangıçta var olmayan ulusların çekirdek bölgeleri: modern ülke kodları ya da admin-1 adları */
const NATION_CORES: Record<Tag, { a3?: string[]; regions?: [string, string[]] }> = {
  POL: { a3: ['POL'] },
  FIN: { a3: ['FIN', 'ALD'] },
  EST: { a3: ['EST'] },
  LVA: { a3: ['LVA'] },
  LTU: { a3: ['LTU'] },
  UKR: { a3: ['UKR'] },
  BLR: { a3: ['BLR'] },
  GEO: { a3: ['GEO'] },
  ARM: { a3: ['ARM'] },
  AZE: { a3: ['AZE'] },
  IRL: { a3: ['IRL'] },
  ISL: { a3: ['ISL'] },
  CSK: { a3: ['CZE', 'SVK'] },
  HUN: { a3: ['HUN'] },
  HRV: { a3: ['HRV'] },
  SVN: { a3: ['SVN'] },
  BIH: { a3: ['BIH'] },
  SYR: { a3: ['SYR'] },
  IRQ: { a3: ['IRQ'] },
  KOR: { a3: ['KOR', 'PRK'] },
  IND: { a3: ['IND', 'PAK', 'BGD'] },
  PHL: { a3: ['PHL'] },
  HEJ: { regions: ['SAU', ['Al Madinah', 'Makkah', 'Tabuk', 'Al-Baha']] },
};

// ---------------------------------------------------------------------------
// Nüfus ve ekonomi (yaklaşık, Maddison Project 1913 düzeyi)
// ---------------------------------------------------------------------------
/** 1913 nüfusu / 2020 nüfusu (modern sınırlar içinde, yaklaşık) */
const POP_RATIO: Record<string, number> = {
  GBR: 0.63, IRL: 0.62, FRA: 0.62, DEU: 0.65, AUT: 0.76, HUN: 0.8, CZE: 0.94, SVK: 0.55, POL: 0.7, RUS: 0.62, UKR: 0.8,
  BLR: 0.72, MDA: 0.75, LTU: 1.0, LVA: 1.3, EST: 0.75, FIN: 0.55, ITA: 0.62, ESP: 0.43, PRT: 0.58, NLD: 0.36, BEL: 0.67,
  LUX: 0.42, CHE: 0.45, DNK: 0.51, NOR: 0.45, SWE: 0.54, ISL: 0.24, SRB: 0.65, KOS: 0.28, MKD: 0.48, MNE: 0.48, BGR: 0.69,
  ROU: 0.65, GRC: 0.5, ALB: 0.32, HRV: 0.85, SVN: 0.62, BIH: 0.58,
  TUR: 0.18, SYR: 0.14, LBN: 0.1, ISR: 0.06, PSX: 0.08, JOR: 0.03, IRQ: 0.07, SAU: 0.09, YEM: 0.1, KWT: 0.01, BHR: 0.06,
  QAT: 0.01, ARE: 0.01, OMN: 0.1, IRN: 0.12, AFG: 0.14, GEO: 0.55, ARM: 0.4, AZE: 0.25, KAZ: 0.3, UZB: 0.13, TKM: 0.17,
  KGZ: 0.13, TJK: 0.11,
  CHN: 0.31, TWN: 0.15, MNG: 0.18, JPN: 0.41, KOR: 0.19, PRK: 0.25, IND: 0.18, PAK: 0.09, BGD: 0.18, MMR: 0.23, LKA: 0.22,
  NPL: 0.19, IDN: 0.18, PHL: 0.086, VNM: 0.2, THA: 0.12, MYS: 0.1, SGP: 0.05, KHM: 0.15, LAO: 0.12,
  EGY: 0.12, LBY: 0.1, TUN: 0.16, DZA: 0.125, MAR: 0.12, NGA: 0.083, ETH: 0.08, ZAF: 0.105, COD: 0.11, KEN: 0.055,
  USA: 0.295, CAN: 0.21, MEX: 0.117, CUB: 0.21, GTM: 0.12, HND: 0.06, SLV: 0.17, NIC: 0.1, CRI: 0.08, PAN: 0.08, HTI: 0.17,
  DOM: 0.07, COL: 0.104, VEN: 0.1, ECU: 0.097, PER: 0.13, BOL: 0.16, CHL: 0.18, ARG: 0.17, URY: 0.34, PRY: 0.09, BRA: 0.112,
  AUS: 0.19, NZL: 0.22,
};
const CONTINENT_POP: Record<string, number> = {
  Europe: 0.6,
  Asia: 0.25,
  Africa: 0.09,
  'North America': 0.25,
  'South America': 0.13,
  Oceania: 0.2,
};

/** 1913 kişi başı GSYH (1990 uluslararası doları, yuvarlanmış) */
const GDP_PC: Record<string, number> = {
  GBR: 4900, IRL: 2700, FRA: 3500, DEU: 3650, AUT: 3450, HUN: 2100, CZE: 2100, SVK: 1600, POL: 1700, RUS: 1500, UKR: 1400,
  BLR: 1300, MDA: 1100, LTU: 1500, LVA: 2000, EST: 2000, FIN: 2100, ITA: 2560, ESP: 2050, PRT: 1250, NLD: 4050, BEL: 4200,
  LUX: 4000, CHE: 4250, DNK: 3900, NOR: 2450, SWE: 3100, ISL: 2000, SRB: 1050, KOS: 800, MKD: 900, MNE: 900, BGR: 1500,
  ROU: 1750, GRC: 1600, ALB: 800, HRV: 1600, SVN: 2100, BIH: 1000,
  TUR: 1200, SYR: 1000, LBN: 1200, ISR: 1000, PSX: 900, JOR: 800, IRQ: 900, SAU: 650, YEM: 600, KWT: 700, BHR: 700, QAT: 700,
  ARE: 700, OMN: 650, IRN: 1000, AFG: 650, GEO: 1100, ARM: 1100, AZE: 1300, KAZ: 900, UZB: 900, TKM: 900, KGZ: 800, TJK: 800,
  CHN: 550, TWN: 750, MNG: 550, JPN: 1390, KOR: 870, PRK: 870, IND: 670, PAK: 650, BGD: 600, MMR: 690, LKA: 900, NPL: 550,
  IDN: 900, PHL: 1070, VNM: 750, THA: 840, MYS: 900, SGP: 1300, KHM: 650, LAO: 550,
  EGY: 900, LBY: 800, TUN: 950, DZA: 1100, MAR: 850, ZAF: 1600,
  USA: 5300, CAN: 4450, MEX: 1730, CUB: 2000, GTM: 1200, HND: 1000, SLV: 1000, NIC: 1000, CRI: 1500, PAN: 1300, HTI: 700,
  DOM: 900, COL: 1240, VEN: 1100, ECU: 1000, PER: 1040, BOL: 900, CHL: 2990, ARG: 3800, URY: 3300, PRY: 900, BRA: 810,
  AUS: 5150, NZL: 5150,
};
const CONTINENT_GDP: Record<string, number> = {
  Europe: 2000,
  Asia: 700,
  Africa: 600,
  'North America': 1200,
  'South America': 1000,
  Oceania: 900,
};

// ---------------------------------------------------------------------------
// Ordular ve donanmalar
// ---------------------------------------------------------------------------
/** [ülke, modern ülke kodu, bölge adı (nameEn), bin asker] — savaşan büyük güçlerin konuşlanması */
const DEPLOY: [Tag, string, string, number][] = [
  // Almanya: Batı'da yedi ordu (Schlieffen planı), Doğu Prusya'da 8. Ordu
  ['DEU', 'DEU', 'Düsseldorf', 580],
  ['DEU', 'DEU', 'Saarbrücken', 600],
  ['DEU', 'FRA', 'Strasbourg', 400],
  ['DEU', 'POL', 'Warmian-Masurian Voivodeship', 200],
  ['DEU', 'DEU', 'Berlin', 150],
  // Fransa: Lorraine ve Ardennes cephesi (Plan XVII)
  ['FRA', 'FRA', 'Nancy', 500],
  ['FRA', 'FRA', 'Reims', 600],
  ['FRA', 'FRA', 'Besançon', 100],
  ['FRA', 'FRA', 'Paris', 150],
  ['FRA', 'FRA', 'Lille', 50],
  ['FRA', 'DZA', 'Algiers', 60],
  // Belçika
  ['BEL', 'BEL', 'Liège', 117],
  ['BEL', 'BEL', 'Brussels', 50],
  // Birleşik Krallık: Britanya Seferî Kuvveti, iç savunma, Hindistan ordusu
  ['GBR', 'GBR', 'London', 120],
  ['GBR', 'GBR', 'Reading', 150],
  ['GBR', 'IND', 'Delhi', 160],
  // Rusya: Kuzeybatı (Doğu Prusya) ve Güneybatı (Galiçya) cepheleri, Kafkasya, Türkistan, Uzak Doğu
  ['RUS', 'LTU', 'Kaunas', 200],
  ['RUS', 'POL', 'Masovian Voivodeship', 250],
  ['RUS', 'POL', 'Lublin Voivodeship', 300],
  ['RUS', 'UKR', 'Rivne', 250],
  ['RUS', 'UKR', 'Khmelnytskyi', 150],
  ['RUS', 'RUS', 'Saint Petersburg', 100],
  ['RUS', 'GEO', 'Tbilisi', 150],
  ['RUS', 'UZB', 'Tashkent', 50],
  ['RUS', 'RUS', 'Vladivostok', 50],
  // Avusturya-Macaristan: Galiçya ve Balkan cepheleri
  ['AUH', 'POL', 'Kraków', 250],
  ['AUH', 'UKR', 'Lviv', 450],
  ['AUH', 'UKR', 'Chernivtsi', 100],
  ['AUH', 'BIH', 'Sarajevo', 300],
  ['AUH', 'SRB', 'Novi Sad', 180],
  ['AUH', 'AUT', 'Vienna', 70],
  // Sırbistan ve Karadağ
  ['SRB', 'SRB', 'Belgrade', 200],
  ['SRB', 'SRB', 'Niš', 100],
  ['MNE', 'MNE', 'Podgorica', 40],
  // Osmanlı: seferberlik ilanı (2 Ağustos 1914)
  ['OTT', 'TUR', 'Istanbul', 150],
  ['OTT', 'TUR', 'Edirne', 60],
  ['OTT', 'TUR', 'Erzurum', 100],
  ['OTT', 'SYR', 'Damascus', 60],
  ['OTT', 'IRQ', 'Baghdad', 30],
  ['OTT', 'SAU', 'Jeddah', 20],
  // Tarafsız büyük güçler
  ['ITA', 'ITA', 'Turin', 100],
  ['ITA', 'ITA', 'Verona', 120],
  ['ITA', 'ITA', 'Rome', 80],
  ['JPN', 'JPN', 'Tokyo', 200],
  ['JPN', 'KOR', 'Seoul', 50],
  ['USA', 'USA', 'San Antonio', 30],
  ['USA', 'PHL', 'Manila', 15],
];

/** Diğer ülkelerin yaklaşık kara kuvvetleri (bin) — sınır ve başkentlere dağıtılır */
const ARMY_K: Record<Tag, number> = {
  USA: 55, ESP: 140, PRT: 30, NLD: 200, CHE: 220, DNK: 50, NOR: 30, SWE: 80, BGR: 85, ROU: 120, GRC: 60, ALB: 5, LUX: 0,
  CHN: 450, MNG: 5, TIB: 5, PRS: 10, AFG: 50, NJD: 15, SHM: 10, OMN: 3, KWT: 1, BHR: 1, ARE: 1, EGY: 15, ETH: 100, LBR: 1,
  THA: 30, NPL: 30, BTN: 1, MEX: 100, CUB: 10, HTI: 5, DOM: 3, GTM: 5, HND: 3, SLV: 4, NIC: 3, CRI: 1, PAN: 0, COL: 7, VEN: 9,
  ECU: 5, PER: 7, BOL: 5, CHL: 20, ARG: 25, URY: 10, PRY: 3, BRA: 30, CAN: 3, NFL: 0, AUS: 3, NZL: 2, ZAF: 10, AND: 0, MCO: 0,
  LIE: 0, SMR: 0,
};

/** [ülke, modern ülke kodu, kıyı bölgesi, gemi] — başlıca filolar ve üsleri */
const FLEETS: [Tag, string, string, number][] = [
  ['GBR', 'GBR', 'Aberdeen', 85], // Büyük Filo, Scapa Flow
  ['GBR', 'GBR', 'Plymouth', 25], // Kanal Filosu
  ['GBR', 'MLT', 'Valletta', 10], // Akdeniz Filosu
  ['DEU', 'DEU', 'Bremen', 60], // Açık Deniz Filosu, Wilhelmshaven
  ['DEU', 'DEU', 'Hamburg', 10], // Kiel
  ['FRA', 'FRA', 'Marseille', 35], // Toulon
  ['FRA', 'FRA', 'Rennes', 10], // Brest
  ['RUS', 'RUS', 'Saint Petersburg', 18], // Baltık Filosu
  ['RUS', 'RUS', 'Sevastopol', 12], // Karadeniz Filosu
  ['AUH', 'HRV', 'Split', 22], // Pola
  ['ITA', 'ITA', 'Taranto', 20],
  ['ITA', 'ITA', 'Genoa', 8], // La Spezia
  ['JPN', 'JPN', 'Tokyo', 35],
  ['USA', 'USA', 'Virginia Beach', 35], // Atlantik Filosu
  ['USA', 'USA', 'San Francisco', 15],
  ['OTT', 'TUR', 'Istanbul', 6],
];
const SHIPS: Record<Tag, number> = { ESP: 6, NLD: 6, SWE: 6, ARG: 5, BRA: 5, CHL: 4, GRC: 5, PRT: 3, NOR: 3, DNK: 3, CHN: 4, AUS: 3 };

/**
 * Anavatan (çekirdek) toprakları: modern ülke kodları. Bunların dışındaki bölgeler sömürgedir.
 * Tanımsız ülkelerde anavatan kendi koduyla aynı modern ülkedir.
 */
const HOMELAND: Record<Tag, string[]> = {
  GBR: ['GBR', 'IRL', 'IMN', 'JEY', 'GGY'],
  FRA: ['FRA', 'MCO'],
  DEU: ['DEU', 'POL', 'FRA', 'RUS', 'LTU'],
  AUH: ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH', 'POL', 'UKR', 'ROU', 'SRB'],
  RUS: ['RUS', 'FIN', 'ALD', 'EST', 'LVA', 'LTU', 'BLR', 'UKR', 'MDA', 'POL', 'GEO', 'ARM', 'AZE', 'TUR'],
  OTT: ['TUR', 'SYR', 'LBN', 'ISR', 'PSX', 'JOR', 'IRQ', 'SAU', 'YEM', 'QAT'],
  ITA: ['ITA'],
  DNK: ['DNK', 'FRO'],
  SRB: ['SRB', 'KOS', 'MKD'],
  PRS: ['IRN'],
  TIB: ['CHN'],
  NJD: ['SAU'],
  SHM: ['SAU'],
  NFL: ['CAN'],
};

/** Anavatan kodu içinde kalan deniz aşırı bölgeler (ör. Fransız Guyanası, Karayipler) */
function overseas(world: World, p: number): boolean {
  const wp = world.data.provinces[p];
  return (wp.a3 === 'FRA' || wp.a3 === 'NLD') && (wp.lon < -30 || wp.lat < 35);
}

/** Açık başkentler: [modern ülke kodu, bölge adı] (modern başkentten farklı olanlar ve yeni devletler) */
const CAPITALS: Record<Tag, [string, string]> = {
  GBR: ['GBR', 'London'],
  DEU: ['DEU', 'Berlin'],
  AUH: ['AUT', 'Vienna'],
  RUS: ['RUS', 'Saint Petersburg'],
  OTT: ['TUR', 'Istanbul'],
  BRA: ['BRA', 'Rio de Janeiro'],
  AUS: ['AUS', 'Melbourne'],
  NFL: ['CAN', "St. John's"],
  PRS: ['IRN', 'Tehran'],
  TIB: ['CHN', 'Lhasa'],
  NJD: ['SAU', 'Riyadh'],
  SHM: ['SAU', "Ha'il (West)"],
  ARE: ['ARE', 'Dubai'],
  HEJ: ['SAU', 'Jeddah'],
  CSK: ['CZE', 'Prague'],
};

// ---------------------------------------------------------------------------
// Kurulum
// ---------------------------------------------------------------------------
function provinceLookup(world: World) {
  const byName = new Map<string, number>();
  world.data.provinces.forEach((p, i) => byName.set(`${p.a3}|${p.nameEn}`, i));
  return (a3: string, nameEn: string): number => {
    const i = byName.get(`${a3}|${nameEn}`);
    if (i === undefined) throw new Error(`1914 senaryosu: bölge bulunamadı ${a3}/${nameEn}`);
    return i;
  };
}

/** Bir bölgenin 1914 sahibi: içerdiği idari birimlerin çoğunluğu (eşitlikte merkez birimi) */
export function owner1914(world: World, p: number): Tag {
  const wp = world.data.provinces[p];
  const forced = PROVINCE_OWN[wp.id];
  if (forced) return forced;
  const base = OWN[wp.a3];
  if (!base) throw new Error(`1914 senaryosu: ${wp.a3} için sahip tanımlı değil`);
  const regionMap = REGION_OWN[wp.a3];
  if (!regionMap) return base;
  const votes = new Map<Tag, number>();
  const regions = REGIONS[p] ?? [];
  for (const r of regions) {
    const t = regionMap[r] ?? base;
    votes.set(t, (votes.get(t) ?? 0) + 1);
  }
  if (!votes.size) return base;
  let best = regionMap[regions[0]] ?? base;
  let bestV = votes.get(best) ?? 0;
  for (const [t, v] of votes) {
    if (v > bestV) {
      best = t;
      bestV = v;
    }
  }
  return best;
}

function ratioFor(a3: string, table: Record<string, number>, byContinent: Record<string, number>, fallback: number): number {
  return table[a3] ?? byContinent[NE[a3]?.continent ?? ''] ?? fallback;
}

function tierFromGdp(gdp: number): IncomeTier {
  if (gdp >= 3400) return 'high';
  if (gdp >= 2000) return 'upper';
  if (gdp >= 1000) return 'lower';
  return 'low';
}

function unitMix1914(techs: Set<string>): [UnitType, number][] {
  const has = (u: UnitType) => {
    const d = UNIT_DEFS[u];
    if (d.requires && !techs.has(d.requires)) return false;
    if (d.obsoleteBy && techs.has(d.obsoleteBy)) return false;
    return true;
  };
  const mix: [UnitType, number][] = [['infantry', 0.74], ['cavalry', 0.09], ['light', 0.03]];
  if (has('artillery')) mix.push(['artillery', 0.13]);
  if (has('air')) mix.push(['air', 0.01]);
  const tot = mix.reduce((s, [, v]) => s + v, 0);
  return mix.filter(([u]) => has(u)).map(([u, v]) => [u, v / tot]);
}

function units(mix: [UnitType, number][], thousands: number): Partial<ArmyUnits> {
  const out: Partial<ArmyUnits> = {};
  for (const [u, f] of mix) {
    const n = Math.round(thousands * f) * 1000;
    if (n > 0) out[u] = n;
  }
  return out;
}

export function build1914(world: World): ScenarioSetup {
  const P = world.P;
  const find = provinceLookup(world);
  const owner: Tag[] = [];
  const pop: number[] = [];
  const urban: number[] = [];
  for (let p = 0; p < P; p++) {
    const wp = world.data.provinces[p];
    owner.push(owner1914(world, p));
    const r = ratioFor(wp.a3, POP_RATIO, CONTINENT_POP, 0.2);
    pop.push(Math.round(wp.pop * r));
    urban.push(Math.round(wp.urban * r));
  }
  const output = new Array<number>(P).fill(0);
  for (const [a3, provs] of world.byA3) {
    const gdp = ratioFor(a3, GDP_PC, CONTINENT_GDP, 700);
    const total = (provs.reduce((s, p) => s + pop[p], 0) * gdp) / 1e6;
    const dist = distributeOutput(world, provs, total, pop, (p) => (pop[p] > 0 ? Math.min(1, urban[p] / pop[p]) : 0));
    for (const [p, v] of dist) output[p] = v;
  }

  const colonial: boolean[] = owner.map((tag, p) => {
    const a3 = world.data.provinces[p].a3;
    const home = HOMELAND[tag] ?? [tag];
    return !home.includes(a3) || overseas(world, p);
  });
  const byOwner = provincesByOwner(owner);
  for (const t of byOwner.keys()) if (!COUNTRIES_1914[t]) throw new Error(`1914 senaryosu: tanımsız ülke ${t}`);
  const neighbors = ownerNeighbors(world, owner);
  const allTags = Object.keys(COUNTRIES_1914);
  const activeTags = [...byOwner.keys()].sort((a, b) => byOwner.get(b)!.length - byOwner.get(a)!.length || (a < b ? -1 : 1));
  const colors = assignColors([...activeTags, ...allTags.filter((t) => !byOwner.has(t)).sort()], neighbors);

  // Çekirdekler: başlangıçta var olmayan ulusların tarihî toprakları
  const extraCores: Record<number, Tag[]> = {};
  const coreProvs = new Map<Tag, number[]>();
  for (const [tag, def] of Object.entries(NATION_CORES)) {
    const list: number[] = [];
    for (let p = 0; p < P; p++) {
      const wp = world.data.provinces[p];
      if (def.a3?.includes(wp.a3)) list.push(p);
      else if (def.regions && wp.a3 === def.regions[0] && def.regions[1].includes(REGIONS[p]?.[0] ?? '')) list.push(p);
    }
    coreProvs.set(tag, list);
    for (const p of list) (extraCores[p] ??= []).push(tag);
  }

  // Başkentler
  const capitals: Record<Tag, number> = {};
  for (const tag of allTags) {
    const explicit = CAPITALS[tag];
    if (explicit) {
      capitals[tag] = find(explicit[0], explicit[1]);
      continue;
    }
    const provs = byOwner.get(tag) ?? coreProvs.get(tag) ?? world.byA3.get(tag) ?? [];
    if (provs.length) capitals[tag] = findCapital(world, provs, tag, pop);
  }

  // Binalar: her modern ülke parçası kendi gelir düzeyine, sahibinin teknolojisine göre
  const buildings: number[][] = Array.from({ length: P }, () => BUILDING_IDS.map(() => 0));
  const techsOf = new Map<Tag, Set<string>>();
  for (const tag of allTags) techsOf.set(tag, new Set(TECHS.filter((t) => t.year <= COUNTRIES_1914[tag].techYear).map((t) => t.id)));
  const groups = new Map<string, number[]>();
  for (let p = 0; p < P; p++) {
    const k = `${owner[p]}|${world.data.provinces[p].a3}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  for (const [k, provs] of groups) {
    const [tag, a3] = k.split('|');
    const techs = techsOf.get(tag)!;
    const techCap: Partial<Record<(typeof BUILDING_IDS)[number], number>> = {};
    for (const id of BUILDING_IDS) {
      let lv = 0;
      for (const t of BUILDING_DEFS[id].techLevels) {
        if (t && !techs.has(t)) break;
        lv++;
      }
      techCap[id] = lv;
    }
    const tier = tierFromGdp(ratioFor(a3, GDP_PC, CONTINENT_GDP, 700));
    const bmap = defaultBuildings(world, provs, tier, pop, (p) => urban[p], capitals[tag] ?? -1, 0.25, techCap);
    for (const [p, arr] of bmap) buildings[p] = arr;
  }

  // Ordular
  const armiesBy = new Map<Tag, { province: number; units: Partial<ArmyUnits> }[]>();
  const addArmy = (tag: Tag, province: number, u: Partial<ArmyUnits>) => {
    if (!armiesBy.has(tag)) armiesBy.set(tag, []);
    armiesBy.get(tag)!.push({ province, units: u });
    buildings[province][6] = Math.max(buildings[province][6], 1);
  };
  for (const [tag, a3, name, k] of DEPLOY) addArmy(tag, find(a3, name), units(unitMix1914(techsOf.get(tag)!), k));
  const RIVALS: Record<Tag, Tag[]> = { NLD: ['DEU'], CHE: ['DEU', 'FRA', 'ITA', 'AUH'], BGR: ['SRB', 'ROU', 'GRC', 'OTT'], ROU: ['AUH', 'BGR', 'RUS'], GRC: ['OTT', 'BGR'], ESP: ['FRA'], CHN: ['JPN', 'MNG', 'TIB'], MEX: ['USA'], NJD: ['SHM', 'OTT'], SHM: ['NJD'], AFG: ['GBR', 'RUS'], ETH: ['ITA'] };
  for (const [tag, k] of Object.entries(ARMY_K)) {
    const provs = byOwner.get(tag);
    if (!provs || k <= 0) continue;
    const placed = placeArmies(world, owner, tag, provs, capitals[tag], k * 1000, unitMix1914(techsOf.get(tag)!), RIVALS[tag] ?? [], pop);
    for (const a of placed) addArmy(tag, a.province, a.units);
  }
  for (const [tag, a3, name, ships] of FLEETS) {
    const p = find(a3, name);
    buildings[p][3] = Math.max(buildings[p][3], 2);
    addArmy(tag, p, { navy: ships });
  }
  for (const [tag, ships] of Object.entries(SHIPS)) {
    const provs = (byOwner.get(tag) ?? []).filter((p) => world.coastal[p]);
    if (!provs.length) continue;
    const cap = capitals[tag];
    const port = world.coastal[cap] ? cap : provs.sort((a, b) => pop[b] - pop[a])[0];
    buildings[port][3] = Math.max(buildings[port][3], 2);
    addArmy(tag, port, { navy: ships });
  }

  const atWar = new Set(['DEU', 'AUH', 'FRA', 'RUS', 'GBR', 'BEL', 'SRB']);
  const countries: ScenarioCountryDef[] = allTags.map((tag) => {
    const info = COUNTRIES_1914[tag];
    const provs = byOwner.get(tag) ?? [];
    const gdps = provs.map((p) => ratioFor(world.data.provinces[p].a3, GDP_PC, CONTINENT_GDP, 700));
    const avgGdp = gdps.length ? gdps.reduce((a, b) => a + b, 0) / gdps.length : 1000;
    const policies: Partial<Record<PolicyId, number>> = {
      tax: 2,
      military: atWar.has(tag) ? 4 : 2,
      infrastructure: avgGdp >= 2000 ? 2 : 1,
      education: avgGdp >= 2000 ? 2 : 1,
      security: info.gov === AM ? 2 : 1,
      welfare: avgGdp >= 3000 ? 1 : 0,
      development: 1,
    };
    return {
      tag,
      name: info.name,
      nameEn: info.nameEn,
      flag: info.flag,
      color: colors.get(tag) ?? [128, 128, 128],
      government: info.gov,
      techYear: info.techYear,
      armies: armiesBy.get(tag) ?? [],
      policies,
      aggression: info.aggression ?? 0.15,
      focus: atWar.has(tag) ? 'military' : avgGdp >= 3000 ? 'economy' : 'balanced',
      inactive: info.inactive || !byOwner.has(tag),
      treasuryMonths: atWar.has(tag) ? 2 : 3,
    };
  });

  const DOMINIONS = ['CAN', 'NFL', 'AUS', 'NZL', 'ZAF'];
  const treaties: ScenarioSetup['treaties'] = [
    // Britanya dominyonları ve koruma altındaki devletler
    ...[...DOMINIONS, 'EGY', 'KWT', 'BHR', 'ARE'].map((b) => ({ type: 'vassal' as const, a: 'GBR', b })),
    { type: 'defensive', a: 'SRB', b: 'MNE' },
    { type: 'defensive', a: 'GBR', b: 'JPN' }, // İngiliz-Japon İttifakı (1902, 1911'de yenilendi)
    { type: 'defensive', a: 'GBR', b: 'PRT' }, // İngiliz-Portekiz İttifakı
  ];

  const relations: [Tag, Tag, number][] = [
    ['FRA', 'DEU', -80], ['RUS', 'AUH', -70], ['SRB', 'AUH', -90], ['RUS', 'DEU', -50], ['GBR', 'DEU', -40], ['BEL', 'DEU', -80],
    ['ITA', 'AUH', -25], ['ITA', 'DEU', 15], ['OTT', 'RUS', -70], ['OTT', 'GRC', -50], ['OTT', 'ITA', -40], ['OTT', 'BGR', -30],
    ['OTT', 'DEU', 50], ['OTT', 'GBR', -20], ['OTT', 'SRB', -30], ['BGR', 'SRB', -60], ['BGR', 'GRC', -50], ['BGR', 'ROU', -50],
    ['ROU', 'AUH', -20], ['ROU', 'RUS', -15], ['SRB', 'RUS', 70], ['SRB', 'MNE', 80], ['SRB', 'GRC', 40], ['FRA', 'RUS', 70],
    ['FRA', 'GBR', 60], ['GBR', 'RUS', 30], ['GBR', 'JPN', 50], ['JPN', 'DEU', -20], ['JPN', 'RUS', -10], ['JPN', 'CHN', -40],
    ['USA', 'MEX', -40], ['USA', 'JPN', -10], ['USA', 'GBR', 30], ['GRC', 'ITA', -20], ['ALB', 'SRB', -30], ['ALB', 'GRC', -30],
    ['PRS', 'RUS', -20], ['PRS', 'GBR', -10], ['NJD', 'SHM', -60], ['NJD', 'OTT', -20], ['ETH', 'ITA', -40], ['CHN', 'RUS', -20],
    ['MNG', 'CHN', -50], ['TIB', 'CHN', -60], ['AFG', 'GBR', -10], ['NLD', 'DEU', 10], ['SWE', 'RUS', -30], ['NOR', 'GBR', 30],
    ['DNK', 'DEU', -10], ['AUH', 'DEU', 80], ['PRT', 'GBR', 50], ['ARG', 'GBR', 40], ['CHL', 'PER', -30], ['BOL', 'CHL', -30],
    ['BOL', 'PRY', -30], ['PER', 'ECU', -30], ['COL', 'USA', -30], ['CUB', 'USA', 40], ['HTI', 'DOM', -20], ['BGR', 'DEU', 20],
    ['MNE', 'AUH', -60],
  ];

  return {
    era: 'industrial',
    countries,
    owner,
    extraCores,
    colonial,
    pop,
    output,
    buildings,
    alliances: [
      { name: 'İkili İttifak', leader: 'DEU', members: ['DEU', 'AUH'] },
      { name: 'İtilaf Devletleri', leader: 'GBR', members: ['GBR', 'FRA', 'RUS'] },
    ],
    treaties,
    wars: [
      { name: 'Avusturya-Macaristan–Sırbistan', attackers: ['AUH'], defenders: ['SRB'], goal: { type: 'scenario', id: 's1914_balkan' } },
      { name: 'Büyük Savaş', attackers: ['DEU'], defenders: ['RUS', 'FRA', 'BEL', 'GBR', ...DOMINIONS], goal: { type: 'scenario', id: 's1914_great_war' } },
    ],
    relations: relations.filter(([a, b]) => byOwner.has(a) && byOwner.has(b)),
    capitals,
    popScale: 0.25,
  };
}

export const SCENARIO_1914: ScenarioInfo = {
  id: 's1914',
  year: 1914,
  startDate: '1914-08-04',
  name: { tr: 'Büyük Savaş', en: 'The Great War' },
  description: {
    tr: '4 Ağustos 1914. Saraybosna suikastının ardından Avusturya-Macaristan Sırbistan’a, Almanya Rusya, Fransa ve Belçika’ya savaş açtı; bugün Birleşik Krallık da savaşa giriyor. Osmanlı, İtalya, Japonya ve Amerika henüz tarafsız.',
    en: '4 August 1914. After the Sarajevo assassination, Austria-Hungary is at war with Serbia and Germany with Russia, France and Belgium; today the United Kingdom joins. The Ottomans, Italy, Japan and America are still neutral.',
  },
  available: false,
  status: {
    tr: 'Dengeleme sürüyor: sınırlar, ülkeler, ordular ve olaylar hazır; yapay zekânın cephe davranışı ayarlandıktan sonra açılacak.',
    en: 'Balancing in progress: borders, countries, armies and events are ready; it will open once AI front behaviour is tuned.',
  },
  sources: {
    tr: 'Sınırlar: Natural Earth idari birimleri üzerinde 1914 sınırlarının bölge düzeyinde eşlenmesi (küçük sınır değişiklikleri komşu bölgeyle birleşik görünebilir). Nüfus ve üretim: Maddison Project düzeyinde yuvarlanmış 1913 tahminleri. Ordular ve donanmalar yaklaşık oyun değerleridir.',
    en: 'Borders: 1914 borders mapped at province level onto Natural Earth administrative units (small border changes may appear merged with a neighbouring province). Population and output: rounded 1913 estimates at Maddison Project level. Armies and fleets are approximate game values.',
  },
  victory: {
    tr: 'Senaryo hedefi: bölge sayınızı %25 artırın ve barış içinde olun (tüm savaşlarınızı bitirin).',
    en: 'Scenario goal: increase your province count by 25% and be at peace (end all of your wars).',
  },
  build: build1914,
  featured: ['OTT', 'DEU', 'GBR', 'FRA', 'RUS', 'AUH', 'ITA', 'USA', 'JPN', 'SRB', 'BEL', 'BGR', 'ROU', 'GRC', 'CHN', 'PRS', 'ESP', 'BRA', 'ARG', 'MEX'],
};
