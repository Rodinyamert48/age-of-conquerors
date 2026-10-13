/**
 * 1914 — Birinci Dünya Savaşı'nın başlangıcı.
 * Senaryo verisi ayrı bir aşamada eklenecektir; o zamana kadar menüde "hazırlanıyor" görünür.
 */
import type { ScenarioInfo } from './types';

export const SCENARIO_1914: ScenarioInfo = {
  id: 's1914',
  year: 1914,
  startDate: '1914-08-04',
  name: { tr: 'Birinci Dünya Savaşı', en: 'The Great War' },
  description: {
    tr: '4 Ağustos 1914. Avrupa’nın büyük güçleri savaşa giriyor.',
    en: '4 August 1914. The great powers of Europe go to war.',
  },
  available: false,
  status: {
    tr: 'Veri hazırlanıyor: 1914 sınırlarının bölge düzeyinde eşleştirilmesi sürüyor.',
    en: 'Data in preparation: province-level mapping of 1914 borders is in progress.',
  },
  sources: { tr: '—', en: '—' },
  victory: { tr: '—', en: '—' },
  featured: [],
};
