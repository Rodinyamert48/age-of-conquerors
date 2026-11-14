/** Kurulabilir birlikler: üye ülkelerin topraklarının büyük bölümünü ele geçiren üye yeni ülkeyi ilan eder */
export interface UnionDef {
  id: string;
  name: { tr: string; en: string };
  members: string[];
  /** flag-icons kodu (yoksa kurucunun bayrağı kalır) */
  flag?: string;
  color: [number, number, number];
}

export const UNIONS: UnionDef[] = [
  { id: 'turan', name: { tr: 'Turan', en: 'Turan' }, members: ['TUR', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ'], color: [0, 150, 170] },
  { id: 'eu', name: { tr: 'Avrupa Federasyonu', en: 'European Federation' }, members: ['DEU', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT', 'POL'], flag: 'eu', color: [40, 70, 160] },
  { id: 'gran_colombia', name: { tr: 'Büyük Kolombiya', en: 'Gran Colombia' }, members: ['COL', 'VEN', 'ECU', 'PAN'], color: [210, 170, 40] },
  { id: 'arab', name: { tr: 'Arap Birliği', en: 'Arab Union' }, members: ['SAU', 'EGY', 'IRQ', 'SYR', 'JOR', 'ARE', 'KWT', 'QAT', 'OMN', 'YEM'], flag: 'arab', color: [20, 120, 60] },
  { id: 'scandinavia', name: { tr: 'İskandinavya', en: 'Scandinavia' }, members: ['SWE', 'NOR', 'DNK', 'FIN'], color: [60, 110, 180] },
  { id: 'soviet', name: { tr: 'Sovyetler Birliği', en: 'Soviet Union' }, members: ['RUS', 'UKR', 'BLR', 'KAZ', 'GEO', 'ARM', 'AZE'], color: [170, 30, 30] },
  { id: 'yugoslavia', name: { tr: 'Yugoslavya', en: 'Yugoslavia' }, members: ['SRB', 'HRV', 'BIH', 'SVN', 'MKD', 'MNE'], color: [50, 80, 150] },
  { id: 'rome', name: { tr: 'Roma İmparatorluğu', en: 'Roman Empire' }, members: ['ITA', 'GRC', 'ESP', 'FRA', 'TUN'], color: [130, 20, 60] },
  { id: 'ottoman', name: { tr: 'Osmanlı İmparatorluğu', en: 'Ottoman Empire' }, members: ['TUR', 'SYR', 'IRQ', 'GRC', 'BGR', 'EGY'], color: [150, 30, 40] },
];

export const UNION_SHARE = 0.8;
