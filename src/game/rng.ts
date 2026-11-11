/**
 * Deterministik rastgelelik. Tüm oyun rastgeleliği GameState.rng durumundan üretilir;
 * aynı tohum ve aynı komutlar her zaman aynı sonucu verir.
 */
import type { GameState } from './types';

/** mulberry32 adımı: yeni durum ve [0,1) değeri döndürür */
export function nextRandom(seed: number): [number, number] {
  const a = (seed + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [a, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

export function random(s: GameState): number {
  const [next, v] = nextRandom(s.rng);
  s.rng = next;
  return v;
}

export function randomRange(s: GameState, min: number, max: number): number {
  return min + random(s) * (max - min);
}

export function randomInt(s: GameState, min: number, maxInclusive: number): number {
  return min + Math.floor(random(s) * (maxInclusive - min + 1));
}

export function chance(s: GameState, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return random(s) < p;
}

export function pick<T>(s: GameState, arr: readonly T[]): T | undefined {
  if (!arr.length) return undefined;
  return arr[Math.floor(random(s) * arr.length)];
}

export function weightedPick<T>(s: GameState, items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let r = random(s) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Durumdan bağımsız, deterministik dizi karması (örn. ülke başına sabit gecikme) */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Durumu değiştirmeden tohumdan sabit değer üretir */
export function seededValue(seed: number): number {
  return nextRandom(seed)[1];
}
