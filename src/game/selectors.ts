/**
 * Arayüz için türetilmiş veriler (salt okunur).
 */
import type { Tag } from './types';
import { allianceOf, armiesAt, armiesOf, neighborCountries, provincesOf, warsOf, type Ctx } from './ctx';
import { armySoldiers, fortLevel, overlordOf, vassalsOf, REBEL_TAG } from './query';
import { TAX_RATES } from './defs/policies';
import { provinceOutput, taxEfficiency, B_PORT, B_TRADE, B_IND } from './economy';
import { TERRAIN_DEFS } from './defs/terrain';

export interface CountrySummary {
  tag: Tag;
  provinces: number;
  pop: number;
  output: number;
  soldiers: number;
  ships: number;
  armies: number;
  capitalName: string;
  neighbors: Tag[];
  alliance: string | null;
  allianceLeader: Tag | null;
  overlord: Tag | null;
  vassals: Tag[];
  wars: string[];
}

export function countrySummary(ctx: Ctx, tag: Tag): CountrySummary {
  const { s, w } = ctx;
  const c = s.countries[tag];
  let pop = 0;
  let output = 0;
  const provs = provincesOf(ctx, tag);
  for (const p of provs) {
    pop += s.provinces[p].pop;
    output += s.provinces[p].output;
  }
  let soldiers = 0;
  let ships = 0;
  const armies = armiesOf(ctx, tag);
  for (const a of armies) {
    soldiers += armySoldiers(a);
    ships += a.units.navy;
  }
  const cap = c && c.capital >= 0 ? w.data.provinces[c.capital] : null;
  const al = allianceOf(ctx, tag);
  return {
    tag,
    provinces: provs.length,
    pop,
    output,
    soldiers,
    ships,
    armies: armies.length,
    capitalName: cap ? (cap.city?.name ?? cap.name) : '—',
    neighbors: [...neighborCountries(ctx, tag)].filter((t) => t !== REBEL_TAG && s.countries[t]?.alive),
    alliance: al?.name ?? null,
    allianceLeader: al?.leader ?? null,
    overlord: overlordOf(ctx, tag),
    vassals: vassalsOf(ctx, tag),
    wars: warsOf(ctx, tag).map((x) => x.id),
  };
}

/** Bölgenin sahibine sağladığı tahmini aylık gelir */
export function provinceMonthlyIncome(ctx: Ctx, p: number): number {
  const ps = ctx.s.provinces[p];
  const c = ctx.s.countries[ps.owner];
  if (!c || ps.controller !== ps.owner) return 0;
  const out = provinceOutput(ctx, p);
  const rate = TAX_RATES[c.policies.tax] ?? 0.15;
  const tax = (out * rate * taxEfficiency(ctx, ps.owner)) / 12;
  const b = ps.buildings;
  const trade = (out * (0.006 * b[B_TRADE] + 0.004 * b[B_PORT])) / 12;
  const prod = (out * 0.006 * b[B_IND]) / 12;
  return tax + trade + prod;
}

export function provinceDefense(ctx: Ctx, p: number): number {
  return TERRAIN_DEFS[ctx.w.terrain[p]].defense + fortLevel(ctx, p) * 0.15;
}

export function armiesInProvince(ctx: Ctx, p: number) {
  return armiesAt(ctx, p);
}

/** Dünya üretim sıralaması */
export function outputRanking(ctx: Ctx): { tag: Tag; output: number }[] {
  const m = new Map<Tag, number>();
  for (const ps of ctx.s.provinces) m.set(ps.owner, (m.get(ps.owner) ?? 0) + ps.output);
  return [...m.entries()].filter(([t]) => t !== REBEL_TAG).map(([tag, output]) => ({ tag, output })).sort((a, b) => b.output - a.output);
}
