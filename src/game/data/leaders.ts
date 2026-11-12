/**
 * 1 Ocak 2020 itibarıyla ülke liderleri (görünüm amaçlı; oyunu yönetmezler).
 * Yalnızca bilinen devlet/hükûmet başkanları listelenir; diğer ülkelerde unvan genel gösterilir.
 */
export interface Leader {
  name: string;
  title: { tr: string; en: string };
}

const P = { tr: 'Cumhurbaşkanı', en: 'President' };
const PM = { tr: 'Başbakan', en: 'Prime Minister' };
const K = { tr: 'Kral', en: 'King' };
const CH = { tr: 'Şansölye', en: 'Chancellor' };
const L = (name: string, title: { tr: string; en: string }): Leader => ({ name, title });

export const LEADERS_2020: Record<string, Leader> = {
  TUR: L('Recep Tayyip Erdoğan', P),
  USA: L('Donald Trump', { tr: 'Başkan', en: 'President' }),
  RUS: L('Vladimir Putin', P),
  CHN: L('Xi Jinping', { tr: 'Devlet Başkanı', en: 'President' }),
  GBR: L('Boris Johnson', PM),
  FRA: L('Emmanuel Macron', P),
  DEU: L('Angela Merkel', CH),
  ITA: L('Giuseppe Conte', PM),
  ESP: L('Pedro Sánchez', PM),
  PRT: L('Marcelo Rebelo de Sousa', P),
  NLD: L('Mark Rutte', PM),
  BEL: L('Sophie Wilmès', PM),
  SWE: L('Stefan Löfven', PM),
  NOR: L('Erna Solberg', PM),
  DNK: L('Mette Frederiksen', PM),
  FIN: L('Sanna Marin', PM),
  IRL: L('Leo Varadkar', { tr: 'Taoiseach', en: 'Taoiseach' }),
  POL: L('Andrzej Duda', P),
  CZE: L('Andrej Babiš', PM),
  HUN: L('Viktor Orbán', PM),
  ROU: L('Klaus Iohannis', P),
  BGR: L('Boyko Borisov', PM),
  GRC: L('Kyriakos Mitsotakis', PM),
  SRB: L('Aleksandar Vučić', P),
  UKR: L('Volodimir Zelenskiy', P),
  BLR: L('Aleksandr Lukaşenko', P),
  KAZ: L('Kasım-Comart Tokayev', P),
  UZB: L('Şavkat Mirziyoyev', P),
  AZE: L('İlham Aliyev', P),
  ARM: L('Nikol Paşinyan', PM),
  GEO: L('Salome Zurabişvili', P),
  IRN: L('Ali Hamaney', { tr: 'Dinî Lider', en: 'Supreme Leader' }),
  IRQ: L('Berham Salih', P),
  SYR: L('Beşşar Esad', P),
  ISR: L('Binyamin Netanyahu', PM),
  JOR: L('II. Abdullah', K),
  LBN: L('Mişel Avn', P),
  SAU: L('Selman bin Abdülaziz', K),
  QAT: L('Temim bin Hamed', { tr: 'Emir', en: 'Emir' }),
  ARE: L('Muhammed bin Zayed', { tr: 'Veliaht Prens', en: 'Crown Prince' }),
  KWT: L('Sabah el-Ahmed', { tr: 'Emir', en: 'Emir' }),
  EGY: L('Abdülfettah es-Sisi', P),
  LBY: L('Fayiz es-Serrac', PM),
  TUN: L('Kays Said', P),
  DZA: L('Abdülmecid Tebbun', P),
  MAR: L('VI. Muhammed', K),
  SDN: L('Abdülfettah el-Burhan', { tr: 'Egemenlik Konseyi Başkanı', en: 'Sovereignty Council Chair' }),
  ETH: L('Abiy Ahmed', PM),
  KEN: L('Uhuru Kenyatta', P),
  TZA: L('John Magufuli', P),
  UGA: L('Yoweri Museveni', P),
  NGA: L('Muhammadu Buhari', P),
  GHA: L('Nana Akufo-Addo', P),
  SEN: L('Macky Sall', P),
  COD: L('Félix Tshisekedi', P),
  AGO: L('João Lourenço', P),
  ZWE: L('Emmerson Mnangagwa', P),
  ZAF: L('Cyril Ramaphosa', P),
  SOM: L('Muhammed Abdullahi Farmaajo', P),
  IND: L('Narendra Modi', PM),
  PAK: L('İmran Han', PM),
  BGD: L('Şeyh Hasina', PM),
  LKA: L('Gotabaya Rajapaksa', P),
  NPL: L('K. P. Sharma Oli', PM),
  AFG: L('Eşref Gani', P),
  JPN: L('Şinzo Abe', PM),
  KOR: L('Moon Jae-in', P),
  PRK: L('Kim Jong-un', { tr: 'Yüksek Lider', en: 'Supreme Leader' }),
  TWN: L('Tsai Ing-wen', P),
  MNG: L('Khaltmaagiin Battulga', P),
  VNM: L('Nguyen Phu Trong', { tr: 'Genel Sekreter', en: 'General Secretary' }),
  THA: L('Prayut Chan-o-cha', PM),
  MYS: L('Mahathir Muhammed', PM),
  SGP: L('Lee Hsien Loong', PM),
  IDN: L('Joko Widodo', P),
  PHL: L('Rodrigo Duterte', P),
  MMR: L('Aung San Suu Kyi', { tr: 'Devlet Danışmanı', en: 'State Counsellor' }),
  AUS: L('Scott Morrison', PM),
  NZL: L('Jacinda Ardern', PM),
  CAN: L('Justin Trudeau', PM),
  MEX: L('Andrés Manuel López Obrador', P),
  CUB: L('Miguel Díaz-Canel', P),
  VEN: L('Nicolás Maduro', P),
  COL: L('Iván Duque', P),
  PER: L('Martín Vizcarra', P),
  CHL: L('Sebastián Piñera', P),
  ARG: L('Alberto Fernández', P),
  BRA: L('Jair Bolsonaro', P),
};

export function leaderOf(tag: string): Leader | undefined {
  return LEADERS_2020[tag];
}
