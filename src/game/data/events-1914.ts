/**
 * 1914 (Büyük Savaş) senaryosu olayları. Tarihler belgelenmiş olaylara dayanır; her olayın
 * tarihî seçeneği yapay zekâ için ağırlıklıdır, diğer seçenek alternatif tarih yaratır.
 * Bir olayın koşulları tarihinde sağlanmıyorsa, sağlandığı ilk tura kadar (en çok 400 gün) bekler.
 */
import type { EventDef } from '../events';

const S = ['s1914'];

export const EVENTS_1914: EventDef[] = [
  {
    id: 'ww1_montenegro',
    historical: true,
    scenarios: S,
    countries: ['MNE'],
    date: '1914-08-05',
    once: true,
    conditions: { all: [{ countryAlive: 'SRB' }, { countryAlive: 'AUH' }, { not: { atWarWith: 'AUH' } }] },
    title: { tr: 'Karadağ Sırbistan’ın Yanında', en: 'Montenegro Stands with Serbia' },
    desc: {
      tr: 'Kral I. Nikola, Sırbistan ile kardeşlik ve savunma bağlarını hatırlatarak Avusturya-Macaristan’a savaş ilan etmeye hazırlanıyor.',
      en: 'King Nicholas I, invoking the bonds of brotherhood and defence with Serbia, prepares to declare war on Austria-Hungary.',
    },
    options: [
      { text: { tr: 'Sırbistan’ın yanında savaş (tarihî)', en: 'Fight alongside Serbia (historical)' }, effects: [{ joinWarOf: { tag: 'SRB' } }], ai: 20 },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ relation: { target: 'SRB', value: -40 } }], ai: 1 },
    ],
  },
  {
    id: 'ww1_austria_russia',
    historical: true,
    scenarios: S,
    countries: ['AUH'],
    date: '1914-08-06',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { not: { atWarWith: 'RUS' } }] },
    title: { tr: 'Müttefikin Çağrısı', en: 'The Ally’s Call' },
    desc: {
      tr: 'Almanya Rusya ve Fransa ile savaşta. Viyana İkili İttifak gereği Rusya’ya savaş ilan etmeli mi, yoksa yalnızca Sırbistan’a mı odaklanmalı?',
      en: 'Germany is at war with Russia and France. Should Vienna honour the Dual Alliance and declare war on Russia, or concentrate on Serbia alone?',
    },
    options: [
      { text: { tr: 'Rusya’ya savaş ilan et (tarihî)', en: 'Declare war on Russia (historical)' }, effects: [{ joinWarOf: { tag: 'DEU' } }], ai: 20 },
      { text: { tr: 'Yalnızca Sırbistan cephesine odaklan', en: 'Focus on the Serbian front only' }, effects: [{ relation: { target: 'DEU', value: -35 } }, { stability: 3 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_japan',
    historical: true,
    scenarios: S,
    countries: ['JPN'],
    date: '1914-08-23',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { not: { atWarWith: 'DEU' } }] },
    title: { tr: 'İngiliz-Japon İttifakı', en: 'The Anglo-Japanese Alliance' },
    desc: {
      tr: 'Londra ittifak gereği destek istiyor. Almanya’nın Çin’deki Kiautschou kiralık bölgesi ve Pasifik adaları Japonya’nın önünde.',
      en: 'London requests support under the alliance. Germany’s Kiautschou lease in China and its Pacific islands lie open before Japan.',
    },
    options: [
      { text: { tr: 'Almanya’ya savaş ilan et (tarihî)', en: 'Declare war on Germany (historical)' }, effects: [{ joinWarOf: { tag: 'GBR' } }, { stability: 2 }], ai: 20 },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ relation: { target: 'GBR', value: -30 } }], ai: 1 },
    ],
  },
  {
    id: 'ww1_ottoman_entry',
    historical: true,
    scenarios: S,
    countries: ['OTT'],
    date: '1914-10-29',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { not: { atWarWith: 'RUS' } }, { not: { atWarWith: 'DEU' } }] },
    title: { tr: 'Karadeniz Baskını', en: 'The Black Sea Raid' },
    desc: {
      tr: '2 Ağustos’ta Almanya ile gizli ittifak imzalandı; Goeben ve Breslau zırhlıları Osmanlı donanmasına katıldı. Filo Rus limanlarına saldırmaya hazır. Savaşa girmek mi, silahlı tarafsızlığı sürdürmek mi?',
      en: 'A secret alliance with Germany was signed on 2 August; the Goeben and Breslau have joined the Ottoman navy. The fleet is ready to strike Russian ports. Enter the war, or keep armed neutrality?',
    },
    options: [
      {
        text: { tr: 'İttifak Devletleri safında savaşa gir (tarihî)', en: 'Enter the war with the Central Powers (historical)' },
        effects: [{ joinAllianceOf: { tag: 'DEU' } }, { joinWarOf: { tag: 'DEU' } }, { relation: { target: 'DEU', value: 20 } }],
        ai: 20,
      },
      { text: { tr: 'Silahlı tarafsızlığı sürdür', en: 'Keep armed neutrality' }, effects: [{ stability: 5 }, { relation: { target: 'DEU', value: -30 } }], ai: 1 },
    ],
  },
  {
    id: 'ww1_italy_entry',
    historical: true,
    scenarios: S,
    countries: ['ITA'],
    date: '1915-05-23',
    once: true,
    conditions: { all: [{ countryAlive: 'AUH' }, { not: { atWarWith: 'AUH' } }, { not: { atWarWith: 'FRA' } }] },
    title: { tr: 'Londra Antlaşması', en: 'The Treaty of London' },
    desc: {
      tr: 'İtilaf Devletleri, savaşa girmesi karşılığında İtalya’ya Trentino, Güney Tirol, Trieste ve Dalmaçya’yı vaat ediyor.',
      en: 'The Entente promises Italy Trentino, South Tyrol, Trieste and Dalmatia in return for entering the war.',
    },
    options: [
      {
        text: { tr: 'Avusturya-Macaristan’a savaş ilan et (tarihî)', en: 'Declare war on Austria-Hungary (historical)' },
        effects: [{ joinWarOf: { tag: 'FRA' } }, { relation: { target: 'AUH', value: -40 } }],
        ai: 20,
      },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ stability: 4 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_bulgaria_entry',
    historical: true,
    scenarios: S,
    countries: ['BGR'],
    date: '1915-10-14',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { countryAlive: 'SRB' }, { not: { atWar: true } }] },
    title: { tr: 'Makedonya Sorunu', en: 'The Macedonian Question' },
    desc: {
      tr: 'Merkezî Devletler, İkinci Balkan Savaşı’nda kaybedilen Makedonya’yı geri vaat ediyor. Sofya Sırbistan’a karşı savaşa girmeli mi?',
      en: 'The Central Powers promise the return of Macedonia, lost in the Second Balkan War. Should Sofia go to war against Serbia?',
    },
    options: [
      {
        text: { tr: 'Merkezî Devletler safında savaşa gir (tarihî)', en: 'Join the Central Powers (historical)' },
        effects: [{ joinAllianceOf: { tag: 'DEU' } }, { joinWarOf: { tag: 'DEU' } }],
        ai: 20,
      },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ stability: 4 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_portugal_entry',
    historical: true,
    scenarios: S,
    countries: ['PRT'],
    date: '1916-03-09',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { not: { atWarWith: 'DEU' } }] },
    title: { tr: 'Alman Gemilerine El Konulması', en: 'Seizure of German Ships' },
    desc: {
      tr: 'Portekiz, limanlarındaki Alman ticaret gemilerine İngiltere’nin isteğiyle el koydu; Almanya savaş ilan ediyor.',
      en: 'At Britain’s request Portugal seized German merchant ships in its ports; Germany declares war.',
    },
    options: [
      { text: { tr: 'Müttefikimiz İngiltere’nin yanında savaş (tarihî)', en: 'Fight alongside our British ally (historical)' }, effects: [{ joinWarOf: { tag: 'GBR' } }], ai: 20 },
      { text: { tr: 'Gemileri iade et ve tarafsız kal', en: 'Return the ships and stay neutral' }, effects: [{ relation: { target: 'GBR', value: -30 } }, { treasury: -0.5 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_arab_revolt',
    historical: true,
    scenarios: S,
    countries: ['OTT'],
    date: '1916-06-10',
    once: true,
    conditions: { all: [{ atWarWith: 'GBR' }, { countryAlive: 'GBR' }] },
    title: { tr: 'Arap İsyanı', en: 'The Arab Revolt' },
    desc: {
      tr: 'Mekke Emiri Şerif Hüseyin, İngiltere’nin desteğiyle Osmanlı yönetimine karşı ayaklandı ve Hicaz’ın bağımsızlığını ilan etti.',
      en: 'Sharif Hussein of Mecca, backed by Britain, has risen against Ottoman rule and proclaimed the independence of the Hejaz.',
    },
    options: [
      {
        text: { tr: 'İsyanı bastırmak için kuvvet gönder (tarihî)', en: 'Send forces to crush the revolt (historical)' },
        effects: [{ releaseNations: { tags: ['HEJ'], joinWarsOf: 'GBR' } }, { stability: -5 }],
        ai: 20,
      },
      {
        text: { tr: 'Şerif Hüseyin’le uzlaş (alternatif tarih)', en: 'Come to terms with Sharif Hussein (alternate history)' },
        effects: [{ treasury: -2 }, { stability: -2 }],
        ai: 1,
      },
    ],
  },
  {
    id: 'ww1_romania_entry',
    historical: true,
    scenarios: S,
    countries: ['ROU'],
    date: '1916-08-27',
    once: true,
    conditions: { all: [{ countryAlive: 'AUH' }, { not: { atWar: true } }] },
    title: { tr: 'Transilvanya Vaadi', en: 'The Promise of Transylvania' },
    desc: {
      tr: 'Brusilov Taarruzu’nun başarısından cesaret alan İtilaf, savaşa girmesi karşılığında Romanya’ya Transilvanya’yı vaat ediyor.',
      en: 'Encouraged by the Brusilov Offensive, the Entente promises Romania Transylvania in return for entering the war.',
    },
    options: [
      { text: { tr: 'İtilaf safında savaşa gir (tarihî)', en: 'Join the Entente (historical)' }, effects: [{ joinWarOf: { tag: 'FRA' } }], ai: 20 },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ stability: 3 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_russia_february',
    historical: true,
    scenarios: S,
    countries: ['RUS'],
    date: '1917-03-08',
    once: true,
    conditions: { all: [{ atWar: true }, { warExhaustionAbove: 15 }] },
    title: { tr: 'Şubat Devrimi', en: 'The February Revolution' },
    desc: {
      tr: 'Petrograd’da ekmek kuyrukları ayaklanmaya dönüştü; garnizon halka katıldı. Çar II. Nikolay tahttan çekilmeye zorlanıyor.',
      en: 'Bread queues in Petrograd have turned into revolt; the garrison has joined the crowds. Tsar Nicholas II is being forced to abdicate.',
    },
    options: [
      {
        text: { tr: 'Çar tahttan çekilir, Geçici Hükûmet kurulur (tarihî)', en: 'The Tsar abdicates; a Provisional Government forms (historical)' },
        effects: [{ government: 'republic' }, { stability: -25 }, { unrestAll: 15 }],
        ai: 20,
      },
      {
        text: { tr: 'Anayasal reform ve Duma’ya yetki (alternatif tarih)', en: 'Constitutional reform and power to the Duma (alternate history)' },
        effects: [{ government: 'constitutional_monarchy' }, { stability: -12 }, { warExhaustion: -5 }],
        ai: 1,
      },
    ],
  },
  {
    id: 'ww1_usa_entry',
    historical: true,
    scenarios: S,
    countries: ['USA'],
    date: '1917-04-06',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { not: { atWarWith: 'DEU' } }] },
    title: { tr: 'Sınırsız Denizaltı Savaşı', en: 'Unrestricted Submarine Warfare' },
    desc: {
      tr: 'Almanya sınırsız denizaltı savaşına döndü; Zimmermann telgrafı Meksika’ya ittifak önerisini ortaya çıkardı. Kongre savaş ilanını oyluyor.',
      en: 'Germany has resumed unrestricted submarine warfare, and the Zimmermann telegram revealed an alliance offer to Mexico. Congress votes on a declaration of war.',
    },
    options: [
      { text: { tr: 'Almanya’ya savaş ilan et (tarihî)', en: 'Declare war on Germany (historical)' }, effects: [{ joinWarOf: { tag: 'GBR' } }, { stability: 3 }], ai: 20 },
      { text: { tr: 'Tarafsızlığı sürdür', en: 'Remain neutral' }, effects: [{ relation: { target: 'GBR', value: -20 } }, { relation: { target: 'DEU', value: -30 } }], ai: 1 },
    ],
  },
  {
    id: 'ww1_greece_entry',
    historical: true,
    scenarios: S,
    countries: ['GRC'],
    date: '1917-06-30',
    once: true,
    conditions: { all: [{ countryAlive: 'BGR' }, { not: { atWar: true } }] },
    title: { tr: 'Ulusal Bölünme’nin Sonu', en: 'End of the National Schism' },
    desc: {
      tr: 'Kral Konstantin ülkeyi terk etti; Venizelos hükûmeti birleşik Yunanistan’ı İtilaf safında savaşa sokmak istiyor.',
      en: 'King Constantine has left the country; the Venizelos government wants to bring a united Greece into the war on the Entente side.',
    },
    options: [
      { text: { tr: 'İtilaf safında savaşa gir (tarihî)', en: 'Join the Entente (historical)' }, effects: [{ joinWarOf: { tag: 'FRA' } }], ai: 20 },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ stability: -4 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_brazil_entry',
    historical: true,
    scenarios: S,
    countries: ['BRA'],
    date: '1917-10-26',
    once: true,
    conditions: { all: [{ countryAlive: 'DEU' }, { not: { atWarWith: 'DEU' } }] },
    title: { tr: 'Batırılan Brezilya Gemileri', en: 'Brazilian Ships Sunk' },
    desc: {
      tr: 'Alman denizaltıları Brezilya ticaret gemilerini batırdı. Rio de Janeiro’da savaş ilanı tartışılıyor.',
      en: 'German submarines have sunk Brazilian merchant ships. A declaration of war is debated in Rio de Janeiro.',
    },
    options: [
      { text: { tr: 'Almanya’ya savaş ilan et (tarihî)', en: 'Declare war on Germany (historical)' }, effects: [{ joinWarOf: { tag: 'GBR' } }], ai: 20 },
      { text: { tr: 'Tarafsız kal', en: 'Stay neutral' }, effects: [{ stability: -2 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_russia_october',
    historical: true,
    scenarios: S,
    countries: ['RUS'],
    date: '1917-11-07',
    once: true,
    conditions: { all: [{ atWar: true }, { stabilityBelow: 50 }] },
    title: { tr: 'Ekim Devrimi', en: 'The October Revolution' },
    desc: {
      tr: 'Bolşevikler Petrograd’da Kışlık Saray’ı ele geçirdi ve Geçici Hükûmet’i devirdi. Yeni yönetim “barış, toprak ve ekmek” vaat ediyor.',
      en: 'The Bolsheviks have seized the Winter Palace in Petrograd and overthrown the Provisional Government. The new regime promises “peace, land and bread”.',
    },
    options: [
      {
        text: { tr: 'Sovyet iktidarı ilan edilir (tarihî)', en: 'Soviet power is proclaimed (historical)' },
        effects: [{ government: 'one_party' }, { stability: -10 }, { unrestAll: 20 }, { spawnRebels: 1 }],
        ai: 20,
      },
      { text: { tr: 'Geçici Hükûmet ayakta kalır (alternatif tarih)', en: 'The Provisional Government survives (alternate history)' }, effects: [{ stability: -8 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_brest_litovsk',
    historical: true,
    scenarios: S,
    countries: ['RUS'],
    date: '1918-03-03',
    once: true,
    conditions: { all: [{ atWarWith: 'DEU' }, { stabilityBelow: 45 }] },
    title: { tr: 'Brest-Litovsk Antlaşması', en: 'The Treaty of Brest-Litovsk' },
    desc: {
      tr: 'Merkezî Devletler ağır bir barış dayatıyor: Polonya, Baltık ülkeleri, Finlandiya ve Ukrayna’dan vazgeçilecek; Kars, Ardahan ve Batum Osmanlı’ya bırakılacak.',
      en: 'The Central Powers impose a harsh peace: Poland, the Baltic lands, Finland and Ukraine are to be given up; Kars, Ardahan and Batum ceded to the Ottomans.',
    },
    options: [
      {
        text: { tr: 'Barışı imzala (tarihî)', en: 'Sign the peace (historical)' },
        effects: [
          { releaseNations: { tags: ['POL', 'FIN', 'EST', 'LVA', 'LTU', 'UKR'] } },
          { transferProvinces: { ids: ['TUR-3040'], to: 'OTT' } },
          { whitePeaceAll: true },
          { stability: 10 },
          { warExhaustion: -30 },
        ],
        ai: 20,
      },
      { text: { tr: 'Savaşa devam et', en: 'Fight on' }, effects: [{ stability: -15 }, { warExhaustion: 10 }], ai: 1 },
    ],
  },
  {
    id: 'ww1_influenza',
    historical: true,
    scenarios: S,
    date: '1918-10-01',
    once: true,
    title: { tr: 'İspanyol Gribi', en: 'The Spanish Flu' },
    desc: {
      tr: 'Savaşın son aylarında dünyayı bir grip salgını sarıyor; cephelerdeki ve şehirlerdeki kalabalık nüfus en ağır bedeli ödüyor.',
      en: 'In the final months of the war an influenza pandemic sweeps the world; crowded fronts and cities pay the heaviest price.',
    },
    options: [
      { text: { tr: 'Halk sağlığı önlemleri al', en: 'Take public-health measures' }, effects: [{ treasury: -0.5 }, { manpower: -0.04 }, { stability: -1 }], ai: 3 },
      { text: { tr: 'Savaş çabasını aksatma', en: 'Do not disrupt the war effort' }, effects: [{ manpower: -0.1 }, { stability: -3 }], ai: 2 },
    ],
  },
];
