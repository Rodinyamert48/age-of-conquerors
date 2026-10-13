/**
 * Modern dünya (2020) senaryosu olayları. Tarihler doğrulanabilir olaylara dayanır;
 * seçenekler oyuncunun alternatif tarih yaratmasına izin verir.
 */
import type { EventDef } from '../events';

export const MODERN_EVENTS: EventDef[] = [
  {
    id: 'modern_brexit',
    historical: true,
    scenarios: ['modern'],
    countries: ['GBR'],
    date: '2020-01-31',
    once: true,
    title: { tr: 'Avrupa Birliği’nden Ayrılık', en: 'Leaving the European Union' },
    desc: {
      tr: '2016 referandumunun ardından Birleşik Krallık’ın Avrupa Birliği’nden ayrılma tarihi geldi. Geçiş dönemi 2020 sonuna kadar sürecek.',
      en: 'Following the 2016 referendum, the United Kingdom’s departure from the European Union has arrived. A transition period runs until the end of 2020.',
    },
    options: [
      {
        text: { tr: 'Ayrılığı tamamla', en: 'Complete the departure' },
        effects: [
          { stability: 2 },
          { modifier: { id: 'brexit_frictions', label: { tr: 'Yeni ticaret engelleri', en: 'New trade frictions' }, months: 36, mods: { tradeIncome: -0.05 } } },
        ],
        ai: 9,
      },
      {
        text: { tr: 'İkinci referanduma git', en: 'Call a second referendum' },
        effects: [{ stability: -6 }, { reputation: 3 }],
        ai: 1,
      },
    ],
  },
  {
    id: 'modern_pandemic',
    historical: true,
    scenarios: ['modern'],
    date: '2020-03-11',
    once: true,
    title: { tr: 'Küresel Salgın', en: 'Global Pandemic' },
    desc: {
      tr: 'Dünya Sağlık Örgütü yeni bir koronavirüs salgınını küresel salgın (pandemi) olarak ilan etti. Hükümetler halk sağlığı ile ekonomi arasında zor bir seçim yapmak zorunda.',
      en: 'The World Health Organization has declared the new coronavirus outbreak a pandemic. Governments face a hard choice between public health and the economy.',
    },
    options: [
      {
        text: { tr: 'Sıkı karantina önlemleri', en: 'Strict lockdown measures' },
        effects: [
          { stability: -3 },
          {
            modifier: {
              id: 'pandemic',
              label: { tr: 'Salgın: sıkı önlemler', en: 'Pandemic: strict measures' },
              months: 12,
              mods: { development: -0.03, tradeIncome: -0.15, popGrowth: -0.001 },
            },
          },
        ],
        ai: 1,
      },
      {
        text: { tr: 'Sınırlı önlemler', en: 'Limited measures' },
        effects: [
          { stability: -1 },
          {
            modifier: {
              id: 'pandemic',
              label: { tr: 'Salgın: sınırlı önlemler', en: 'Pandemic: limited measures' },
              months: 12,
              mods: { development: -0.015, tradeIncome: -0.1, popGrowth: -0.004 },
            },
          },
        ],
        ai: 1,
      },
    ],
  },
];
