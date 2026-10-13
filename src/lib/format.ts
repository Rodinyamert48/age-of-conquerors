import { dateFromDay } from '@/game/calendar';
import type { Day } from '@/game/types';

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type Lang = 'tr' | 'en';

export function formatDate(day: Day, lang: Lang = 'tr'): string {
  const { y, m, d } = dateFromDay(day);
  const months = lang === 'tr' ? MONTHS_TR : MONTHS_EN;
  return lang === 'tr' ? `${d} ${months[m - 1]} ${y}` : `${months[m - 1]} ${d}, ${y}`;
}

export function formatMonthYear(day: Day, lang: Lang = 'tr'): string {
  const { y, m } = dateFromDay(day);
  return `${(lang === 'tr' ? MONTHS_TR : MONTHS_EN)[m - 1]} ${y}`;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = lang + JSON.stringify(opts);
  let f = nfCache.get(key);
  if (!f) nfCache.set(key, (f = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', opts)));
  return f;
}

/** Tam sayı (binlik ayraçlı) */
export function formatInt(v: number, lang: Lang = 'tr'): string {
  return nf(lang, { maximumFractionDigits: 0 }).format(Math.round(v));
}

/** Kısa gösterim: 12,4 B / 3,1 Mn / 2,2 Mr */
export function formatCompact(v: number, lang: Lang = 'tr', digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  return nf(lang, { notation: 'compact', maximumFractionDigits: Math.abs(v) < 10 ? digits : Math.abs(v) < 100 ? Math.min(1, digits) : 0 }).format(v);
}

/** Para: senaryo para birimi milyon cinsindendir */
export function formatMoney(millions: number, lang: Lang = 'tr'): string {
  return formatCompact(millions * 1e6, lang);
}

export function formatSignedMoney(millions: number, lang: Lang = 'tr'): string {
  const s = formatMoney(Math.abs(millions), lang);
  return millions >= 0 ? `+${s}` : `−${s}`;
}

export function formatPercent(v: number, lang: Lang = 'tr', digits = 0): string {
  return nf(lang, { style: 'percent', maximumFractionDigits: digits }).format(v);
}

export function formatNumber(v: number, lang: Lang = 'tr', digits = 1): string {
  return nf(lang, { maximumFractionDigits: digits }).format(v);
}

export function rgb(c: [number, number, number], a = 1): string {
  return a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
