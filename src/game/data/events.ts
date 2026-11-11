/**
 * Olay tanımları. Yeni olaylar bu listeye (ya da senaryo dosyalarına) eklenir; motor değişmez.
 */
import type { EventDef } from '../events';
import { MODERN_EVENTS } from './events-modern';
import { EVENTS_1914 } from './events-1914';

export const GENERIC_EVENTS: EventDef[] = [
  {
    id: 'economic_crisis',
    title: { tr: 'Ekonomik Kriz', en: 'Economic Crisis' },
    desc: {
      tr: 'Bütçe açıkları ve borçlanma piyasalarda paniğe yol açtı. Yatırımcılar hükümetten kararlı bir adım bekliyor.',
      en: 'Deficits and debt have triggered panic in the markets. Investors expect decisive action from the government.',
    },
    meanMonths: 18,
    cooldownYears: 5,
    conditions: { any: [{ inDebt: true }, { treasuryBelowMonths: 0.5 }] },
    options: [
      {
        text: { tr: 'Kemer sıkma politikası uygula', en: 'Impose austerity' },
        effects: [
          { stability: -6 },
          { modifier: { id: 'austerity', label: { tr: 'Kemer sıkma', en: 'Austerity' }, months: 12, mods: { taxEfficiency: 0.05, development: -0.004 } } },
        ],
        ai: 2,
      },
      {
        text: { tr: 'Para bas', en: 'Print money' },
        effects: [
          { treasury: 2 },
          { modifier: { id: 'inflation', label: { tr: 'Enflasyon', en: 'Inflation' }, months: 18, mods: { development: -0.01, unrest: 5 } } },
        ],
        ai: 1,
      },
    ],
  },
  {
    id: 'trade_opportunity',
    title: { tr: 'Ticaret Fırsatı', en: 'Trade Opportunity' },
    desc: {
      tr: 'İyi ilişkiler içinde olduğumuz bir ülkenin tüccarları kalıcı bir ticaret anlaşması öneriyor.',
      en: 'Merchants from a friendly nation propose a permanent trade agreement.',
    },
    meanMonths: 60,
    cooldownYears: 3,
    conditions: { atWar: false },
    target: 'tradePartner',
    options: [
      { text: { tr: 'Anlaşmayı imzala', en: 'Sign the agreement' }, effects: [{ addTreaty: { type: 'trade', with: 'TARGET' } }, { relation: { target: 'TARGET', value: 10 } }], ai: 4 },
      { text: { tr: 'Reddet', en: 'Decline' }, effects: [{ relation: { target: 'TARGET', value: -5 } }], ai: 1 },
    ],
  },
  {
    id: 'border_dispute',
    title: { tr: 'Sınır Anlaşmazlığı', en: 'Border Dispute' },
    desc: {
      tr: 'Bir komşumuzla sınır hattı üzerinde gerginlik yaşanıyor. Askerî devriyeler karşı karşıya geldi.',
      en: 'Tensions have flared with a neighbour along the border. Patrols have come face to face.',
    },
    meanMonths: 80,
    cooldownYears: 4,
    target: 'neighbor',
    options: [
      { text: { tr: 'Sert tepki göster', en: 'Respond forcefully' }, effects: [{ relation: { target: 'TARGET', value: -20 } }, { stability: 3 }], ai: 1 },
      { text: { tr: 'Diplomatik çözüm ara', en: 'Seek a diplomatic solution' }, effects: [{ relation: { target: 'TARGET', value: 5 } }, { stability: -2 }], ai: 2 },
    ],
  },
  {
    id: 'political_instability',
    title: { tr: 'Siyasi İstikrarsızlık', en: 'Political Instability' },
    desc: {
      tr: 'Hükümete güven hızla düşüyor. Muhalefet sokakta ve parlamentoda baskı kuruyor.',
      en: 'Confidence in the government is collapsing. The opposition is pushing hard in the streets and in parliament.',
    },
    meanMonths: 14,
    cooldownYears: 3,
    conditions: { stabilityBelow: 35 },
    options: [
      { text: { tr: 'Vergileri düşürerek taviz ver', en: 'Concede by lowering taxes' }, effects: [{ policy: { id: 'tax', delta: -1 } }, { stability: 6 }], ai: 2 },
      { text: { tr: 'Sıkıyönetim ilan et', en: 'Declare martial law' }, effects: [{ unrestAll: -15 }, { stability: -4 }, { reputation: -5 }], ai: 1 },
    ],
  },
  {
    id: 'mass_protests',
    title: { tr: 'Kitlesel Gösteriler', en: 'Mass Protests' },
    desc: {
      tr: 'Huzursuz bölgelerde gösteriler büyüyor. Durum kontrolden çıkarsa isyana dönüşebilir.',
      en: 'Protests are spreading in restless regions. They may turn into open revolt if left unchecked.',
    },
    meanMonths: 12,
    cooldownYears: 2,
    conditions: { maxUnrestAbove: 50 },
    options: [
      { text: { tr: 'Reform sözü ver', en: 'Promise reforms' }, effects: [{ treasury: -1 }, { unrestAll: -10 }, { stability: 4 }], ai: 2 },
      { text: { tr: 'Gösterileri dağıt', en: 'Disperse the protests' }, effects: [{ unrestAll: -4 }, { spawnRebels: 0.5 }, { stability: -3 }], ai: 1 },
    ],
  },
  {
    id: 'tech_breakthrough',
    title: { tr: 'Teknolojik Atılım', en: 'Technological Breakthrough' },
    desc: {
      tr: 'Bilim insanlarımız umut verici bir buluş yaptı. Kaynak ayırırsak araştırmalar hızlanabilir.',
      en: 'Our scientists have made a promising discovery. With funding, research could accelerate.',
    },
    meanMonths: 70,
    cooldownYears: 4,
    options: [
      { text: { tr: 'Araştırmaya kaynak ayır', en: 'Fund the research' }, effects: [{ treasury: -0.5 }, { researchProgress: 0.5 }], ai: 2 },
      {
        text: { tr: 'Buluşu sanayiye aktar', en: 'Transfer it to industry' },
        effects: [{ modifier: { id: 'industrial_boost', label: { tr: 'Sanayi atılımı', en: 'Industrial boost' }, months: 12, mods: { productionIncome: 0.1 } } }],
        ai: 1,
      },
    ],
  },
  {
    id: 'diplomatic_tension',
    title: { tr: 'Diplomatik Gerginlik', en: 'Diplomatic Tension' },
    desc: {
      tr: 'İlişkilerimizin kötü olduğu bir ülkenin açıklamaları basında büyük yankı uyandırdı.',
      en: 'Statements by a hostile neighbour have caused an uproar in the press.',
    },
    meanMonths: 50,
    cooldownYears: 3,
    target: 'rival',
    options: [
      { text: { tr: 'Büyükelçiyi geri çağır', en: 'Recall the ambassador' }, effects: [{ relation: { target: 'TARGET', value: -15 } }, { stability: 2 }], ai: 1 },
      { text: { tr: 'Gerginliği azalt', en: 'De-escalate' }, effects: [{ relation: { target: 'TARGET', value: 10 } }, { reputation: 2 }], ai: 2 },
    ],
  },
  {
    id: 'war_volunteers',
    title: { tr: 'Savaşın Genişlemesi', en: 'The War Widens' },
    desc: {
      tr: 'Cephe genişliyor. Ülke genelinde gönüllü birlikler kurulması önerildi.',
      en: 'The front is widening. Volunteer units have been proposed across the country.',
    },
    meanMonths: 24,
    cooldownYears: 2,
    conditions: { atWar: true },
    options: [
      { text: { tr: 'Gönüllü birlikleri topla', en: 'Raise volunteer units' }, effects: [{ manpower: 0.1 }, { stability: -2 }], ai: 2 },
      { text: { tr: 'Halkı yorma', en: 'Spare the population' }, effects: [{ warExhaustion: -5 }], ai: 1 },
    ],
  },
  {
    id: 'independence_movement',
    title: { tr: 'Bağımsızlık Hareketi', en: 'Independence Movement' },
    desc: {
      tr: 'Çekirdek topraklarımız dışındaki bölgelerde bağımsızlık yanlısı örgütlenme güçleniyor.',
      en: 'Pro-independence organisations are growing in our non-core provinces.',
    },
    meanMonths: 30,
    cooldownYears: 4,
    conditions: { all: [{ hasForeignCores: true }, { maxUnrestAbove: 35 }] },
    options: [
      { text: { tr: 'Özerklik tanı', en: 'Grant autonomy' }, effects: [{ unrestNonCore: -20 }, { stability: -3 }], ai: 2 },
      { text: { tr: 'Hareketi bastır', en: 'Suppress the movement' }, effects: [{ unrestNonCore: 10 }, { stability: 2 }, { spawnRebels: 0.4 }], ai: 1 },
    ],
  },
  {
    id: 'good_harvest',
    title: { tr: 'Bereketli Hasat', en: 'Bountiful Harvest' },
    desc: { tr: 'Bu yıl hasat beklenenin çok üzerinde oldu.', en: 'This year’s harvest far exceeded expectations.' },
    meanMonths: 60,
    cooldownYears: 3,
    conditions: { foodShortage: false },
    options: [
      { text: { tr: 'Depolara al', en: 'Store it' }, effects: [{ food: 3 }], ai: 1 },
      { text: { tr: 'İhraç et', en: 'Export it' }, effects: [{ treasury: 0.4 }], ai: 1 },
    ],
  },
  {
    id: 'famine',
    title: { tr: 'Kıtlık', en: 'Famine' },
    desc: { tr: 'Gıda stokları tükendi; şehirlerde ekmek kuyrukları uzuyor.', en: 'Food stocks have run out; bread lines grow in the cities.' },
    meanMonths: 4,
    cooldownYears: 2,
    conditions: { foodShortage: true },
    options: [
      { text: { tr: 'Acil gıda ithal et', en: 'Import food urgently' }, effects: [{ treasury: -1 }, { food: 2 }, { stability: 3 }], ai: 2 },
      {
        text: { tr: 'Kaderine bırak', en: 'Do nothing' },
        effects: [{ stability: -8 }, { modifier: { id: 'famine', label: { tr: 'Kıtlık', en: 'Famine' }, months: 12, mods: { popGrowth: -0.01 } } }],
        ai: 1,
      },
    ],
  },
  {
    id: 'corruption_scandal',
    title: { tr: 'Yolsuzluk Skandalı', en: 'Corruption Scandal' },
    desc: { tr: 'Üst düzey yetkilileri içeren bir yolsuzluk ağı ortaya çıktı.', en: 'A corruption ring involving senior officials has been exposed.' },
    meanMonths: 70,
    cooldownYears: 5,
    conditions: { stabilityBelow: 65 },
    options: [
      {
        text: { tr: 'Bağımsız soruşturma başlat', en: 'Launch an independent inquiry' },
        effects: [{ treasury: -0.3 }, { stability: 3 }, { modifier: { id: 'anti_corruption', label: { tr: 'Yolsuzlukla mücadele', en: 'Anti-corruption drive' }, months: 24, mods: { taxEfficiency: 0.03 } } }],
        ai: 2,
      },
      { text: { tr: 'Örtbas et', en: 'Cover it up' }, effects: [{ reputation: -5 }, { stability: -2 }], ai: 1 },
    ],
  },
  {
    id: 'refugee_crisis',
    title: { tr: 'Sığınmacı Krizi', en: 'Refugee Crisis' },
    desc: { tr: 'Savaştaki bir komşumuzdan kaçan binlerce kişi sınırımıza dayandı.', en: 'Thousands fleeing a neighbouring war have reached our border.' },
    meanMonths: 30,
    cooldownYears: 4,
    conditions: { all: [{ hasNeighborAtWar: true }, { atWar: false }] },
    target: 'neighborAtWar',
    options: [
      {
        text: { tr: 'Sığınmacıları kabul et', en: 'Accept the refugees' },
        effects: [{ relation: { target: 'TARGET', value: 10 } }, { stability: -3 }, { modifier: { id: 'refugees', label: { tr: 'Sığınmacılar', en: 'Refugees' }, months: 24, mods: { popGrowth: 0.003 } } }],
        ai: 1,
      },
      { text: { tr: 'Sınırı kapat', en: 'Close the border' }, effects: [{ stability: 1 }, { reputation: -3 }], ai: 1 },
    ],
  },
  {
    id: 'war_weariness',
    title: { tr: 'Savaş Bıkkınlığı', en: 'War Weariness' },
    desc: { tr: 'Uzayan savaş halkı yordu; barış çağrıları yükseliyor.', en: 'The long war has worn down the people; calls for peace grow louder.' },
    meanMonths: 10,
    cooldownYears: 2,
    conditions: { warExhaustionAbove: 50 },
    options: [
      { text: { tr: 'Propaganda kampanyası', en: 'Propaganda campaign' }, effects: [{ treasury: -0.5 }, { warExhaustion: -10 }], ai: 2 },
      { text: { tr: 'Halkı dinle', en: 'Listen to the people' }, effects: [{ stability: -5 }, { warExhaustion: -4 }], ai: 1 },
    ],
  },
  {
    id: 'infrastructure_boom',
    title: { tr: 'Altyapı Atılımı', en: 'Infrastructure Boom' },
    desc: { tr: 'İstikrarlı ekonomi büyük yatırımlar için uygun bir ortam yarattı.', en: 'A stable economy has created a favourable climate for major investments.' },
    meanMonths: 80,
    cooldownYears: 5,
    conditions: { all: [{ stabilityAbove: 60 }, { treasuryAboveMonths: 3 }] },
    options: [
      {
        text: { tr: 'Kamu yatırımı başlat', en: 'Launch public investment' },
        effects: [{ treasury: -1 }, { modifier: { id: 'public_works', label: { tr: 'Kamu yatırımları', en: 'Public works' }, months: 24, mods: { buildCost: -0.15, buildTime: -0.1 } } }],
        ai: 2,
      },
      {
        text: { tr: 'Özel sektöre bırak', en: 'Leave it to the private sector' },
        effects: [{ modifier: { id: 'private_investment', label: { tr: 'Özel yatırım', en: 'Private investment' }, months: 24, mods: { development: 0.005 } } }],
        ai: 1,
      },
    ],
  },
];

let all: EventDef[] | null = null;
export function getEventDefs(): EventDef[] {
  if (!all) all = [...GENERIC_EVENTS, ...MODERN_EVENTS, ...EVENTS_1914];
  return all;
}

export function getEventDef(id: string): EventDef | undefined {
  return getEventDefs().find((e) => e.id === id);
}
