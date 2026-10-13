/**
 * Harita katmanları: her katman bölgeleri gerçek oyun verisine göre renklendirir.
 */
import type { MapMode, Tag, Terrain } from '@/game/types';
import type { Ctx } from '@/game/ctx';
import { allianceOf, findTreaty } from '@/game/ctx';
import { atWar, relation, overlordOf, isFriendly, REBEL_TAG, canEnterProvince } from '@/game/query';
import { supplyLimit } from '@/game/movement';
import { provinceOutput } from '@/game/economy';

export type RGB = [number, number, number];

export const TERRAIN_COLORS: Record<Terrain, RGB> = {
  plains: [150, 170, 108],
  forest: [74, 112, 70],
  hills: [160, 140, 96],
  mountains: [128, 116, 108],
  desert: [214, 192, 138],
  tundra: [176, 186, 190],
  jungle: [52, 120, 72],
  marsh: [96, 128, 112],
};

function lerp(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

/** 3 duraklı sıralı renk skalası */
export function ramp(stops: RGB[], t: number): RGB {
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return lerp(stops[i], stops[i + 1], k - i);
}

export const ECON_RAMP: RGB[] = [
  [38, 52, 70],
  [64, 110, 120],
  [140, 170, 110],
  [226, 196, 96],
];
export const STAB_RAMP: RGB[] = [
  [86, 150, 96],
  [214, 190, 90],
  [196, 72, 62],
];
export const SUPPLY_RAMP: RGB[] = [
  [170, 64, 58],
  [204, 170, 84],
  [92, 160, 104],
];
export const REL_RAMP: RGB[] = [
  [168, 74, 70],
  [118, 118, 122],
  [86, 150, 110],
];

export const DIPLO_COLORS = {
  self: [224, 186, 92] as RGB,
  alliance: [74, 128, 206] as RGB,
  defensive: [110, 170, 214] as RGB,
  vassal: [150, 110, 196] as RGB,
  nap: [96, 168, 160] as RGB,
  war: [204, 64, 60] as RGB,
  rebel: [70, 70, 70] as RGB,
};

export interface ProvinceColoring {
  fill: RGB[];
  /** işgal çizgisi rengi (yoksa null) */
  stripe: (RGB | null)[];
}

export function computeColoring(ctx: Ctx, mode: MapMode, viewer: Tag): ProvinceColoring {
  const { s, w } = ctx;
  const P = w.P;
  const fill: RGB[] = new Array(P);
  const stripe: (RGB | null)[] = new Array(P).fill(null);
  const colorOf = (t: Tag): RGB => (t === REBEL_TAG ? [60, 60, 60] : ((s.countries[t]?.color ?? [120, 120, 120]) as RGB));
  switch (mode) {
    case 'political':
      for (let p = 0; p < P; p++) {
        const ps = s.provinces[p];
        fill[p] = colorOf(ps.owner);
        if (ps.controller !== ps.owner) stripe[p] = colorOf(ps.controller);
      }
      break;
    case 'economic': {
      let max = 1;
      const vals = new Float64Array(P);
      for (let p = 0; p < P; p++) {
        vals[p] = Math.log10(1 + provinceOutput(ctx, p));
        if (vals[p] > max) max = vals[p];
      }
      let min = max;
      for (let p = 0; p < P; p++) if (vals[p] < min) min = vals[p];
      for (let p = 0; p < P; p++) fill[p] = ramp(ECON_RAMP, (vals[p] - min) / Math.max(1e-6, max - min));
      break;
    }
    case 'diplomatic': {
      const al = allianceOf(ctx, viewer);
      const ov = overlordOf(ctx, viewer);
      const cache = new Map<Tag, RGB>();
      const dip = (t: Tag): RGB => {
        let c = cache.get(t);
        if (c) return c;
        if (t === viewer) c = DIPLO_COLORS.self;
        else if (t === REBEL_TAG) c = DIPLO_COLORS.rebel;
        else if (atWar(ctx, viewer, t)) c = DIPLO_COLORS.war;
        else if (al && al.members.includes(t)) c = DIPLO_COLORS.alliance;
        else if (ov === t || findTreaty(ctx, 'vassal', viewer, t)) c = DIPLO_COLORS.vassal;
        else if (findTreaty(ctx, 'defensive', viewer, t)) c = DIPLO_COLORS.defensive;
        else if (findTreaty(ctx, 'nap', viewer, t)) c = DIPLO_COLORS.nap;
        else c = ramp(REL_RAMP, (relation(s, viewer, t) + 100) / 200);
        cache.set(t, c);
        return c;
      };
      for (let p = 0; p < P; p++) {
        const ps = s.provinces[p];
        fill[p] = dip(ps.owner);
        if (ps.controller !== ps.owner) stripe[p] = dip(ps.controller);
      }
      break;
    }
    case 'military': {
      for (let p = 0; p < P; p++) {
        const ps = s.provinces[p];
        const ctrl = ps.controller;
        let c: RGB;
        if (ctrl === viewer) c = [70, 120, 200];
        else if (isFriendly(ctx, viewer, ctrl)) c = [96, 150, 210];
        else if (atWar(ctx, viewer, ctrl)) c = [200, 70, 64];
        else c = [92, 96, 104];
        if (ps.siege) c = lerp(c, [230, 160, 60], 0.5);
        fill[p] = c;
        if (ctrl !== ps.owner && (ps.owner === viewer || isFriendly(ctx, viewer, ps.owner))) stripe[p] = [70, 120, 200];
      }
      break;
    }
    case 'stability':
      for (let p = 0; p < P; p++) fill[p] = ramp(STAB_RAMP, s.provinces[p].unrest / 100);
      break;
    case 'supply': {
      for (let p = 0; p < P; p++) {
        if (!canEnterProvince(ctx, viewer, p)) {
          fill[p] = [58, 60, 66];
          continue;
        }
        const lim = supplyLimit(ctx, p, viewer);
        fill[p] = ramp(SUPPLY_RAMP, Math.log10(Math.max(1, lim / 10000)) / 1.6);
      }
      break;
    }
    case 'terrain':
      for (let p = 0; p < P; p++) fill[p] = TERRAIN_COLORS[w.terrain[p]];
      break;
  }
  return { fill, stripe };
}

export function rgbStr(c: RGB, a = 1): string {
  return a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export const MAP_MODES: MapMode[] = ['political', 'economic', 'diplomatic', 'military', 'stability', 'supply', 'terrain'];
