/**
 * Denge sabitleri. Tüm para değerleri senaryonun para birimindedir (modern senaryoda milyon ABD doları);
 * fiyatlar dünya kişi başı yıllık üretimine (refGdpPc) göre ölçeklenir, böylece her dönemde aynı oranlar korunur.
 */
export const BAL = {
  /** 1 asker-yılı bakım maliyeti / refGdpPc */
  upkeepK: 6,
  /** 1 asker toplama maliyeti / refGdpPc */
  recruitK: 2.5,
  costFactorExp: 0.7,
  costFactorMin: 0.12,
  costFactorMax: 2.5,
  /** ticaret anlaşması yıllık değeri = k × sqrt(üretimA × üretimB) */
  tradeAgreementK: 0.0005,
  /** occupied provinces: işgalcinin vergiden aldığı pay */
  occupationShare: 0.3,
  /** tahkimat seviye başına aylık bakım / ortalama bölge üretimi */
  fortUpkeep: 0.002 / 12,
  /** yiyecek birimi (1 milyon kişinin aylık gıdası) fiyatı = k × refGdpPc × 1e6 / 12 */
  foodPriceK: 0.02,
  /** demir/kömür/kereste birim fiyatı = k × refGdpPc × 1000 */
  resPriceK: 0.6,
  /** vasalın efendisine ödediği vergi payı */
  tribute: 0.15,
  /** savaş seferberlik maliyeti (ordu bakımına oran) */
  warMobilization: 0.25,
  /** düşman topraklarındaki birlikler için ek maliyet oranı */
  foreignDeployment: 0.25,
  baseInterest: 0.03,
  /** aylık manevra: insan gücünün dolma süresi (ay) */
  manpowerRefillMonths: 36,
  /** dönem bazında seferberlik oranı (nüfusun yüzdesi) */
  mobilization: { medieval: 0.025, napoleonic: 0.035, industrial: 0.06, interwar: 0.06, modern: 0.025 } as Record<string, number>,
  popGrowth: { medieval: 0.002, napoleonic: 0.006, industrial: 0.01, interwar: 0.009, modern: 0.009 } as Record<string, number>,
  baseDevelopment: { medieval: 0.001, napoleonic: 0.004, industrial: 0.012, interwar: 0.01, modern: 0.012 } as Record<string, number>,
  /** muharebe: puan başına günlük kayıp (asker) */
  casualtyK: 18,
  /** cephe genişliği (aynı anda çarpışan asker) */
  combatWidth: { medieval: 30000, napoleonic: 60000, industrial: 90000, interwar: 110000, modern: 120000 } as Record<string, number>,
  truceYears: 5,
  napYears: 10,
};

export const DAYS_PER_MONTH = 30.44;
