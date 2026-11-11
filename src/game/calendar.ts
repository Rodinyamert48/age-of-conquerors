/**
 * Takvim: proleptik Gregoryen takviminde gün sayısı ↔ tarih dönüşümü.
 * Gün 0 = 1970-01-01. Negatif günler (1444 gibi) desteklenir.
 */
import type { Day, TimeStep } from './types';

export interface CivilDate {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

// Howard Hinnant — days_from_civil / civil_from_days
export function dayFromDate(y: number, m: number, d: number): Day {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function dateFromDay(day: Day): CivilDate {
  const z = day + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: m <= 2 ? y + 1 : y, m, d };
}

export function parseDate(iso: string): Day {
  const [y, m, d] = iso.split('-').map((v) => parseInt(v, 10));
  return dayFromDate(y, m, d);
}

export function formatISO(day: Day): string {
  const { y, m, d } = dateFromDay(day);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return dayFromDate(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - dayFromDate(y, m, 1);
}

export function yearOf(day: Day): number {
  return dateFromDay(day).y;
}

/** Bir tur adımında ilerlenecek gün sayısı */
export function stepDays(day: Day, step: TimeStep): number {
  if (step === 'day') return 1;
  if (step === 'week') return 7;
  const { y, m, d } = dateFromDay(day);
  // Bir sonraki ayın aynı günü (ay sonu taşmalarında ayın son günü)
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return dayFromDate(ny, nm, nd) - day;
}

/** day1 → day2 arasında bir ay başı geçildi mi (ayın 1'i dahil) */
export function monthsCrossed(fromDay: Day, toDay: Day): number {
  const a = dateFromDay(fromDay);
  const b = dateFromDay(toDay);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

export function yearsBetween(a: Day, b: Day): number {
  return (b - a) / 365.2425;
}
