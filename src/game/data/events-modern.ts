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
  {
    id: 'modern_syria_civil_war',
    historical: true,
    scenarios: ['modern'],
    countries: ['SYR'],
    date: '2022-03-15',
    once: true,
    title: { tr: 'Suriye’de İç Savaş Kızışıyor', en: 'Civil War Intensifies in Syria' },
    desc: {
      tr: 'Merkezî yönetimin zayıflaması üzerine kuzeydoğu ve kuzeybatı bölgeleri kendi yönetimlerini ilan etmeye hazırlanıyor. Yeni asi devletler kurulabilir; savaşı kazanırlarsa bağımsızlıklarını elde ederler.',
      en: 'As central authority weakens, the northeast and northwest are preparing to proclaim their own administrations. New rebel states may emerge; if they win the war they gain independence.',
    },
    options: [
      {
        text: { tr: 'İç savaş patlak veriyor', en: 'The civil war breaks out' },
        effects: [
          { civilWar: { nation: 'SDF', provinces: ['SYR-136', 'SYR-141', 'SYR-142'] } },
          { civilWar: { nation: 'SNG', provinces: ['SYR-137'] } },
          { stability: -15 },
        ],
        ai: 10,
      },
      { text: { tr: 'Taviz vererek ayrılığı önle', en: 'Prevent the split with concessions' }, effects: [{ treasury: -2 }, { stability: 2 }], ai: 1 },
    ],
  },
  {
    id: 'modern_sudan_rsf',
    historical: true,
    scenarios: ['modern'],
    countries: ['SDN'],
    date: '2023-04-15',
    once: true,
    title: { tr: 'Sudan’da Güç Mücadelesi', en: 'Power Struggle in Sudan' },
    desc: {
      tr: 'Ordu ile Hızlı Destek Kuvvetleri arasındaki gerilim silahlı çatışmaya dönüşüyor; Darfur bölgeleri ayrı bir yönetim kuruyor.',
      en: 'Tension between the army and the Rapid Support Forces turns into armed conflict; the Darfur regions set up a separate administration.',
    },
    options: [
      {
        text: { tr: 'Çatışma başlıyor', en: 'Fighting begins' },
        effects: [{ civilWar: { nation: 'RSF', provinces: ['SDN-5857', 'SDN-5858', 'SDN-5859', 'SDN-881-3', 'SDN-881-2', 'SDN-5856-2'] } }, { stability: -12 }],
        ai: 10,
      },
      { text: { tr: 'Müzakereyle yatıştır', en: 'Calm it by negotiation' }, effects: [{ treasury: -1 }, { stability: 2 }], ai: 1 },
    ],
  },
  {
    id: 'modern_libya_split',
    historical: true,
    scenarios: ['modern'],
    countries: ['LBY'],
    date: '2020-04-04',
    once: true,
    title: { tr: 'Libya’da Doğu–Batı Ayrışması', en: 'East–West Split in Libya' },
    desc: {
      tr: 'Doğudaki komutanlar Trablus’taki hükûmeti tanımayacaklarını açıklıyor; Bingazi merkezli ayrı bir yönetim kuruluyor.',
      en: 'Commanders in the east refuse to recognise the government in Tripoli; a separate administration is set up in Benghazi.',
    },
    options: [
      {
        text: { tr: 'Doğu ayrılıyor', en: 'The east splits away' },
        effects: [{ civilWar: { nation: 'LNA', provinces: ['LBY-2984', 'LBY-2983', 'LBY-2987', 'LBY-2985'] } }, { stability: -10 }],
        ai: 10,
      },
      { text: { tr: 'Yetki paylaşımı öner', en: 'Offer power sharing' }, effects: [{ treasury: -1 }, { stability: 3 }], ai: 1 },
    ],
  },
];
