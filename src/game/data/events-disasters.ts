/**
 * Pandemi, doğal afet ve iklim olayları. Her seçenek bir ikilem sunar.
 */
import type { EventDef } from '../events';

const L = (tr: string, en: string) => ({ tr, en });

export const DISASTER_EVENTS: EventDef[] = [
  {
    id: 'pandemic',
    title: L('Salgın', 'Pandemic'),
    desc: L('Hızla yayılan bir hastalık ülkeye ulaştı. Hastaneler doluyor; ekonomi ile halk sağlığı arasında seçim yapmalısınız.', 'A fast-spreading disease has reached the country. Hospitals are filling up; you must choose between the economy and public health.'),
    meanMonths: 180,
    cooldownYears: 12,
    options: [
      { text: L('Sınırları kapat, karantina uygula', 'Close the borders, impose quarantine'), effects: [{ stability: 2 }, { modifier: { id: 'quarantine', label: L('Karantina', 'Quarantine'), months: 12, mods: { tradeIncome: -0.25, productionIncome: -0.12, popGrowth: -0.001 } } }], ai: 2 },
      { text: L('Ekonomiyi açık tut', 'Keep the economy open'), effects: [{ stability: -6 }, { unrestAll: 6 }, { modifier: { id: 'outbreak', label: L('Salgın', 'Outbreak'), months: 18, mods: { popGrowth: -0.012, manpower: -0.08 } } }], ai: 1 },
      { text: L('Aşı ve sağlık seferberliği (pahalı)', 'Vaccine and health drive (expensive)'), effects: [{ treasury: -4 }, { stability: 3 }, { modifier: { id: 'health_drive', label: L('Sağlık seferberliği', 'Health drive'), months: 12, mods: { popGrowth: -0.002, tradeIncome: -0.08 } } }], ai: 1 },
    ],
  },
  {
    id: 'earthquake',
    title: L('Büyük Deprem', 'Major Earthquake'),
    desc: L('Şiddetli bir deprem şehirleri yıktı. Binlerce kişi enkaz altında.', 'A violent earthquake levelled cities. Thousands are trapped under rubble.'),
    meanMonths: 220,
    cooldownYears: 10,
    options: [
      { text: L('Seferberlik ilan et, yeniden inşa et', 'Mobilise and rebuild'), effects: [{ treasury: -3 }, { stability: 4 }, { modifier: { id: 'rebuild', label: L('Yeniden inşa', 'Reconstruction'), months: 24, mods: { buildCost: -0.1 } } }], ai: 2 },
      { text: L('Uluslararası yardım iste', 'Ask for international aid'), effects: [{ treasury: 1 }, { reputation: -2 }, { stability: -2 }], ai: 1 },
      { text: L('Sınırlı yardım (bütçeyi koru)', 'Limited relief (protect the budget)'), effects: [{ stability: -8 }, { unrestAll: 8 }, { modifier: { id: 'quake_damage', label: L('Deprem hasarı', 'Earthquake damage'), months: 24, mods: { productionIncome: -0.08 } } }], ai: 0 },
    ],
  },
  {
    id: 'great_flood',
    title: L('Sel Felaketi', 'Great Flood'),
    desc: L('Aşırı yağışlar nehirleri taşırdı; tarım arazileri ve köyler sular altında.', 'Extreme rain burst the rivers; farmland and villages are under water.'),
    meanMonths: 160,
    cooldownYears: 8,
    options: [
      { text: L('Baraj ve set yatırımı yap', 'Invest in dams and levees'), effects: [{ treasury: -2 }, { modifier: { id: 'flood_defence', label: L('Taşkın koruması', 'Flood defences'), months: 60, mods: { foodOutput: 0.05 } } }], ai: 2 },
      { text: L('Zararı karşıla, geç', 'Cover the damage and move on'), effects: [{ treasury: -1 }, { food: -0.1 }], ai: 1 },
      { text: L('Hiçbir şey yapma', 'Do nothing'), effects: [{ stability: -5 }, { modifier: { id: 'flood_damage', label: L('Sel hasarı', 'Flood damage'), months: 12, mods: { foodOutput: -0.15 } } }], ai: 0 },
    ],
  },
  {
    id: 'drought',
    title: L('Kuraklık', 'Drought'),
    desc: L('Yağışsız geçen mevsimler hasadı kuruttu. Gıda fiyatları yükseliyor.', 'Rainless seasons have withered the harvest. Food prices are climbing.'),
    meanMonths: 150,
    cooldownYears: 8,
    options: [
      { text: L('Gıda ithal et', 'Import food'), effects: [{ treasury: -2 }, { stability: 2 }], ai: 2 },
      { text: L('Karne uygula', 'Introduce rationing'), effects: [{ stability: -4 }, { unrestAll: 5 }], ai: 1 },
      { text: L('Sulama projelerine yatırım yap', 'Invest in irrigation'), effects: [{ treasury: -3 }, { modifier: { id: 'irrigation', label: L('Sulama projeleri', 'Irrigation projects'), months: 96, mods: { foodOutput: 0.1 } } }], ai: 1 },
    ],
  },
  {
    id: 'hurricane',
    title: L('Kasırga', 'Hurricane'),
    desc: L('Dev bir fırtına kıyı şehirlerini ve limanları vurdu.', 'A giant storm battered coastal cities and ports.'),
    meanMonths: 200,
    cooldownYears: 8,
    options: [
      { text: L('Limanları hızla onar', 'Repair the ports quickly'), effects: [{ treasury: -2 }], ai: 2 },
      { text: L('Onarımı ertele', 'Postpone repairs'), effects: [{ modifier: { id: 'storm_damage', label: L('Fırtına hasarı', 'Storm damage'), months: 18, mods: { tradeIncome: -0.15 } } }, { stability: -2 }], ai: 1 },
    ],
  },
  {
    id: 'wildfires',
    title: L('Orman Yangınları', 'Wildfires'),
    desc: L('Sıcak dalgasıyla birlikte ormanlar yanıyor; duman şehirlere ulaştı.', 'With the heatwave, forests are ablaze; smoke has reached the cities.'),
    meanMonths: 170,
    cooldownYears: 6,
    options: [
      { text: L('Orduyu söndürmeye gönder', 'Send the army to fight the fires'), effects: [{ manpower: -0.03 }, { stability: 3 }], ai: 2 },
      { text: L('Yangın filosu satın al', 'Buy a firefighting fleet'), effects: [{ treasury: -1.5 }, { stability: 2 }], ai: 1 },
      { text: L('Kendi hâline bırak', 'Let it burn out'), effects: [{ stability: -5 }, { modifier: { id: 'burnt_land', label: L('Yanmış topraklar', 'Burnt land'), months: 36, mods: { resourceOutput: -0.1 } } }], ai: 0 },
    ],
  },
  {
    id: 'climate_summit',
    title: L('İklim Zirvesi', 'Climate Summit'),
    desc: L('Dünya liderleri karbon salımını azaltmak için toplanıyor. Katılmak sanayiyi yavaşlatır ama itibar kazandırır.', 'World leaders are meeting to cut carbon emissions. Joining slows industry but earns reputation.'),
    meanMonths: 140,
    cooldownYears: 10,
    conditions: { yearAtLeast: 2021 },
    options: [
      { text: L('Anlaşmayı imzala', 'Sign the accord'), effects: [{ reputation: 8 }, { modifier: { id: 'green_transition', label: L('Yeşil dönüşüm', 'Green transition'), months: 96, mods: { productionIncome: -0.04, researchSpeed: 0.06 } } }], ai: 2 },
      { text: L('Reddet, sanayiyi koru', 'Refuse and protect industry'), effects: [{ reputation: -6 }, { modifier: { id: 'dirty_growth', label: L('Kirli büyüme', 'Dirty growth'), months: 60, mods: { productionIncome: 0.05 } } }], ai: 1 },
    ],
  },
  {
    id: 'election_campaign',
    title: L('Seçim Kampanyası', 'Election Campaign'),
    desc: L('Seçimlere üç ay kaldı. Kaybederseniz kabine düşer ve politikalar değişir.', 'Elections are three months away. If you lose, the cabinet falls and policies shift.'),
    options: [
      { text: L('Dürüst kampanya', 'Fair campaign'), effects: [{ reputation: 1 }], ai: 2 },
      { text: L('Seçim vaatleri: zam ve yardım (pahalı)', 'Campaign promises: raises and handouts (costly)'), effects: [{ treasury: -2.5 }, { electionBonus: 0.2 }], ai: 1 },
      { text: L('Sandığa müdahale et (itibar ve istikrar riski)', 'Rig the vote (risks reputation and stability)'), effects: [{ electionBonus: 0.35 }, { reputation: -10 }, { stability: -5 }, { unrestAll: 6 }], ai: 0 },
    ],
  },
];
