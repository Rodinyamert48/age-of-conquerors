/**
 * Ülke renkleri: tanınmış ülkeler için sabit renkler, diğerleri için komşularından
 * ayırt edilebilecek şekilde deterministik olarak seçilen tonlar.
 */
import type { Tag } from '../types';
import { hashString, seededValue } from '../rng';

export const FIXED_COLORS: Record<string, [number, number, number]> = {
  TUR: [196, 52, 52],
  RUS: [74, 124, 89],
  CHN: [214, 170, 46],
  USA: [70, 120, 176],
  GBR: [170, 58, 82],
  FRA: [52, 92, 168],
  DEU: [104, 108, 112],
  ITA: [70, 150, 86],
  ESP: [224, 168, 56],
  JPN: [222, 214, 196],
  IND: [226, 140, 54],
  BRA: [86, 170, 92],
  CAN: [190, 84, 80],
  AUS: [142, 98, 168],
  IRN: [64, 160, 120],
  SAU: [120, 150, 60],
  EGY: [200, 168, 110],
  POL: [212, 96, 116],
  UKR: [226, 196, 78],
  KAZ: [84, 166, 186],
  MEX: [112, 160, 80],
  ARG: [140, 184, 216],
  IDN: [182, 104, 52],
  PAK: [52, 128, 70],
  GRC: [96, 144, 196],
  SWE: [66, 112, 186],
  NOR: [164, 74, 66],
  FIN: [200, 210, 224],
  AUT: [222, 222, 222],
  HUN: [150, 116, 70],
  ROU: [214, 190, 70],
  BGR: [94, 156, 104],
  SRB: [154, 74, 84],
  NLD: [232, 128, 52],
  BEL: [214, 200, 96],
  PRT: [60, 132, 92],
  CHE: [204, 76, 76],
  IRQ: [150, 170, 110],
  SYR: [168, 120, 92],
  ISR: [86, 128, 200],
  KOR: [86, 140, 210],
  PRK: [140, 56, 60],
  MNG: [120, 104, 160],
  AFG: [140, 140, 96],
  NGA: [90, 150, 90],
  ZAF: [166, 132, 76],
  DZA: [110, 160, 120],
  LBY: [130, 110, 80],
  MAR: [176, 64, 72],
  ETH: [128, 166, 70],
  COD: [96, 140, 180],
  VNM: [196, 70, 64],
  THA: [116, 96, 176],
  MMR: [176, 146, 92],
  PHL: [92, 116, 196],
  AZE: [62, 150, 176],
  GEO: [186, 120, 136],
  ARM: [196, 120, 70],
  CYN: [200, 82, 82],
  CYP: [214, 170, 100],
  BLR: [130, 166, 96],
  DNK: [176, 70, 76],
  // Tarihî devletler
  OTT: [74, 140, 112],
  AUH: [222, 214, 186],
  GER: [92, 96, 104],
  RUE: [80, 132, 82],
};

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/**
 * tags: büyükten küçüğe sıralı ülke listesi; neighbors: ülke → komşu ülkeler.
 */
export function assignColors(tags: Tag[], neighbors: Map<Tag, Set<Tag>>): Map<Tag, [number, number, number]> {
  const out = new Map<Tag, [number, number, number]>();
  for (const t of tags) if (FIXED_COLORS[t]) out.set(t, FIXED_COLORS[t]);
  for (const t of tags) {
    if (out.has(t)) continue;
    const seed = hashString(t);
    let best: [number, number, number] | null = null;
    let bestD = -1;
    for (let k = 0; k < 16; k++) {
      const h = seededValue(seed + k * 7919) * 360;
      const sat = 0.32 + seededValue(seed + k * 104729) * 0.28;
      const lig = 0.42 + seededValue(seed + k * 1299709) * 0.2;
      const c = hsl(h, sat, lig);
      let minD = Infinity;
      for (const n of neighbors.get(t) ?? []) {
        const nc = out.get(n);
        if (nc) minD = Math.min(minD, colorDist(c, nc));
      }
      if (minD > bestD) {
        bestD = minD;
        best = c;
      }
    }
    out.set(t, best!);
  }
  return out;
}
