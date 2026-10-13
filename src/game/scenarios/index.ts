/**
 * Senaryo kaydı. Kullanılabilir senaryolar tam veriyle kurulur; verisi henüz doğrulanmamış
 * senaryolar menüde "hazırlanıyor" olarak görünür ve başlatılamaz (uydurma veri kullanılmaz).
 */
import type { ScenarioInfo } from './types';
import { MODERN_SCENARIO } from './modern';
import { SCENARIO_1914 } from './s1914';

const pending = (id: string, year: number, date: string, tr: string, en: string, dtr: string, den: string): ScenarioInfo => ({
  id,
  year,
  startDate: date,
  name: { tr, en },
  description: { tr: dtr, en: den },
  available: false,
  status: {
    tr: 'Veri hazırlanıyor: bu dönemin bölge düzeyindeki sınırları, orduları ve ekonomik verileri henüz doğrulanmadı. Senaryo, mevcut senaryo sistemi üzerine aynı veri biçimiyle eklenecek.',
    en: 'Data in preparation: province-level borders, armies and economic data for this period have not been verified yet. It will be added on the same scenario system using the same data format.',
  },
  sources: { tr: '—', en: '—' },
  victory: { tr: '—', en: '—' },
  featured: [],
});

export const SCENARIOS: ScenarioInfo[] = [
  pending(
    's1444',
    1444,
    '1444-11-11',
    'Geç Orta Çağ',
    'Late Middle Ages',
    'Osmanlı yükselişte, Bizans son günlerinde; Avrupa’da yüzlerce feodal devlet.',
    'The Ottomans rise, Byzantium nears its end; hundreds of feudal states in Europe.',
  ),
  pending(
    's1815',
    1815,
    '1815-06-18',
    'Napolyon Sonrası Avrupa',
    'Post-Napoleonic Europe',
    'Viyana Kongresi’nin ardından yeni bir güç dengesi.',
    'A new balance of power after the Congress of Vienna.',
  ),
  SCENARIO_1914,
  pending(
    's1936',
    1936,
    '1936-01-01',
    'İkinci Dünya Savaşı Öncesi',
    'Before the Second World War',
    'Yeniden silahlanma, ideolojik bloklar ve yaklaşan fırtına.',
    'Rearmament, ideological blocs and the coming storm.',
  ),
  pending(
    's1939',
    1939,
    '1939-09-01',
    'İkinci Dünya Savaşı',
    'The Second World War',
    'Almanya Polonya’yı işgal ediyor; Avrupa yeniden savaşta.',
    'Germany invades Poland; Europe is at war again.',
  ),
  pending(
    's1945',
    1945,
    '1945-09-02',
    'Savaş Sonrası Dünya',
    'Post-War World',
    'Yıkılmış bir dünya, iki süper güç ve sömürge imparatorluklarının sonu.',
    'A shattered world, two superpowers and the end of colonial empires.',
  ),
  MODERN_SCENARIO,
];

export function getScenario(id: string): ScenarioInfo | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
