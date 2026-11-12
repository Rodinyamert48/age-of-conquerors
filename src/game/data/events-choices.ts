/**
 * Faz 3: seçimli olaylar, protestolar ve askerî darbe. Her seçeneğin bedeli ve getirisi vardır.
 */
import type { EventDef } from '../events';

const L = (tr: string, en: string) => ({ tr, en });

export const CHOICE_EVENTS: EventDef[] = [
  {
    id: 'economic_revolution',
    title: L('Ekonomik Devrim', 'Economic Revolution'),
    desc: L(
      'Ekonomi danışmanları köklü bir hamle öneriyor: yerli sanayiyi destekleyin ya da hazineyi vergilerle güçlendirin.',
      'Economic advisers propose a bold move: back domestic industry, or strengthen the treasury through taxes.',
    ),
    meanMonths: 48,
    cooldownYears: 8,
    conditions: { all: [{ atWar: false }, { stabilityAbove: 35 }] },
    options: [
      {
        text: L('Yerli fabrikalar: üretim +%15, hazineden ödeme', 'Domestic factories: +15% production, paid from the treasury'),
        effects: [{ treasury: -3 }, { modifier: { id: 'domestic_factories', label: L('Yerli fabrikalar', 'Domestic factories'), months: 60, mods: { productionIncome: 0.15 } } }],
        ai: 2,
      },
      {
        text: L('Yeni vergiler: vergi geliri +%5', 'New taxes: +5% tax income'),
        effects: [{ stability: -3 }, { modifier: { id: 'new_taxes', label: L('Yeni vergiler', 'New taxes'), months: 60, mods: { taxEfficiency: 0.05 } } }],
        ai: 1,
      },
      { text: L('Mevcut düzeni koru', 'Keep the current system'), effects: [{ stability: 1 }], ai: 1 },
    ],
  },
  {
    id: 'education_reform',
    title: L('Eğitim Seferberliği', 'Education Drive'),
    desc: L('Üniversite rektörleri eğitim sisteminin yeniden yapılandırılmasını talep ediyor.', 'University leaders call for restructuring the education system.'),
    meanMonths: 60,
    cooldownYears: 10,
    conditions: { atWar: false },
    options: [
      { text: L('Büyük yatırım yap (araştırma +%15)', 'Invest heavily (+15% research)'), effects: [{ treasury: -2.5 }, { modifier: { id: 'edu_drive', label: L('Eğitim seferberliği', 'Education drive'), months: 72, mods: { researchSpeed: 0.15 } } }], ai: 2 },
      { text: L('Ücretli eğitim: gelir artar, halk öfkelenir', 'Tuition fees: more income, public anger'), effects: [{ stability: -4 }, { modifier: { id: 'tuition', label: L('Ücretli eğitim', 'Tuition fees'), months: 48, mods: { taxEfficiency: 0.03, researchSpeed: -0.05 } } }], ai: 1 },
    ],
  },
  {
    id: 'energy_boom',
    title: L('Enerji Keşfi', 'Energy Discovery'),
    desc: L('Yeni enerji yatakları bulundu. Devlet mi işletsin, yabancı yatırımcı mı?', 'New energy deposits were found. State-run, or open to foreign investors?'),
    meanMonths: 72,
    cooldownYears: 12,
    conditions: { atWar: false },
    options: [
      { text: L('Devlet işletsin (üretim +%8, maliyetli)', 'State-run (+8% production, costly)'), effects: [{ treasury: -2 }, { modifier: { id: 'state_energy', label: L('Devlet enerjisi', 'State energy'), months: 72, mods: { productionIncome: 0.08, resourceOutput: 0.1 } } }], ai: 2 },
      { text: L('Yabancı yatırımcıya aç (hemen gelir, ilişki +)', 'Open to foreign investors (instant cash)'), effects: [{ treasury: 4 }, { reputation: 3 }], ai: 1 },
    ],
  },
  {
    id: 'trade_union_strike',
    title: L('Genel Grev', 'General Strike'),
    desc: L('Sendikalar ücret artışı için genel greve hazırlanıyor.', 'Unions prepare a general strike over wages.'),
    meanMonths: 60,
    cooldownYears: 6,
    conditions: { all: [{ stabilityBelow: 70 }, { atWar: false }] },
    options: [
      { text: L('Zam ver', 'Grant raises'), effects: [{ treasury: -2 }, { stability: 5 }], ai: 2 },
      { text: L('Grevi yasakla', 'Ban the strike'), effects: [{ stability: -5 }, { reputation: -4 }, { modifier: { id: 'strike_ban', label: L('Grev yasağı', 'Strike ban'), months: 12, mods: { productionIncome: 0.04, unrest: 4 } } }], ai: 1 },
    ],
  },
  {
    id: 'protests_wave',
    title: L('Protesto Dalgası', 'Protest Wave'),
    desc: L('Başkentte ve büyük şehirlerde hükümet karşıtı protestolar başladı.', 'Anti-government protests broke out in the capital and big cities.'),
    meanMonths: 40,
    cooldownYears: 4,
    conditions: { stabilityBelow: 50 },
    options: [
      { text: L('Taleplere kulak ver (maliyetli, istikrar +)', 'Meet the demands (costly, stability up)'), effects: [{ treasury: -1.5 }, { stability: 7 }, { unrestAll: -8 }], ai: 2 },
      { text: L('Polisle bastır (itibar −, huzursuzluk geçici düşer)', 'Suppress with police (reputation down)'), effects: [{ reputation: -6 }, { unrestAll: -10 }, { stability: -3 }, { modifier: { id: 'crackdown', label: L('Sert müdahale', 'Crackdown'), months: 12, mods: { unrest: -6 } } }], ai: 1 },
      { text: L('Görmezden gel', 'Ignore them'), effects: [{ unrestAll: 8 }, { stability: -4 }], ai: 0 },
    ],
  },
  {
    id: 'military_coup',
    title: L('Askerî Darbe Girişimi', 'Military Coup Attempt'),
    desc: L(
      'Generaller hükümete karşı harekete geçti! Tanklar başkentin sokaklarında. Hızlı karar vermelisiniz.',
      'Generals have moved against the government! Tanks are in the capital. You must decide fast.',
    ),
    meanMonths: 150,
    cooldownYears: 15,
    conditions: { all: [{ stabilityBelow: 40 }] },
    options: [
      { text: L('Sadık birliklerle bastır (hazine ve insan gücü kaybı)', 'Crush it with loyal units (costs money and manpower)'), effects: [{ treasury: -3 }, { manpower: -0.15 }, { stability: -4 }, { modifier: { id: 'purge', label: L('Ordu tasfiyesi', 'Army purge'), months: 24, mods: { morale: -0.05 } } }], ai: 2 },
      { text: L('Generallerle uzlaş (ordu güçlenir, hükümet zayıflar)', 'Negotiate with generals (army up, government weaker)'), effects: [{ stability: -6 }, { modifier: { id: 'junta_pact', label: L('Ordu ile uzlaşma', 'Pact with the army'), months: 36, mods: { morale: 0.08, taxEfficiency: -0.05 } } }], ai: 1 },
      { text: L('Yönetimi bırak (askerî cunta kurulur)', 'Hand over power (junta takes over)'), effects: [{ government: 'military_junta' }, { stability: -10 }, { reputation: -10 }], ai: 0 },
    ],
  },
];
