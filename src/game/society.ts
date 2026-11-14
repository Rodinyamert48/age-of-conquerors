/**
 * Toplum ve devlet kimliği: bölgelerin kültürü ve dini, birlik kurma, başkent taşıma,
 * bölge/ülke yeniden adlandırma, ülke bayrağı ve rengi.
 */
import type { Ctx } from './ctx';
import { invalidateAll, provincesOf } from './ctx';
import type { Tag } from './types';
import { notify } from './notify';
import { UNIONS, UNION_SHARE, type UnionDef } from './defs/unions';

type R = { ok: boolean; error?: string };

export type Religion = 'sunni' | 'shia' | 'catholic' | 'orthodox' | 'protestant' | 'buddhist' | 'hindu' | 'jewish' | 'folk' | 'secular';

const REL: [Religion, string][] = [
  ['sunni', 'TUR SAU EGY SYR JOR ARE KWT QAT OMN YEM LBY DZA MAR TUN SDN SOM AFG PAK BGD IDN MYS KAZ UZB TKM KGZ TJK ALB XKX NER MLI SEN GIN MRT TCD GMB DJI COM BRN MDV PSE'],
  ['shia', 'IRN IRQ AZE BHR LBN'],
  ['catholic', 'ITA ESP FRA PRT POL IRL AUT BEL HRV SVN SVK LTU HUN CZE MEX BRA ARG COL VEN PER CHL ECU BOL PRY URY PAN CRI GTM HND SLV NIC CUB DOM PHL AGO MOZ COD COG CMR RWA BDI MLT LUX TLS GNQ'],
  ['orthodox', 'RUS UKR BLR GRC SRB BGR ROU GEO ARM MDA MKD MNE CYP ETH ERI'],
  ['protestant', 'USA GBR DEU NLD SWE NOR DNK FIN ISL CHE CAN AUS NZL ZAF NAM BWA ZMB ZWE MWI KEN UGA TZA GHA NGA LBR JAM EST LVA PNG'],
  ['buddhist', 'THA MMR KHM LAO LKA MNG BTN JPN VNM'],
  ['hindu', 'IND NPL'],
  ['jewish', 'ISR'],
  ['secular', 'CHN PRK KOR'],
];
const RELIGION_OF: Record<string, Religion> = {};
for (const [r, list] of REL) for (const t of list.split(' ')) RELIGION_OF[t] = r;

export function religionOf(tag: Tag): Religion {
  return RELIGION_OF[tag] ?? 'folk';
}

/** Bölgenin kültürü: asimile edildiyse yeni sahibi, yoksa haritadaki köken ülke */
export function cultureOf(ctx: Ctx, p: number): Tag {
  return ctx.s.provinces[p].culture ?? ctx.w.data.provinces[p].a3;
}

export function foreignFaith(ctx: Ctx, p: number): boolean {
  const owner = ctx.s.provinces[p].owner;
  const cul = cultureOf(ctx, p);
  return cul !== owner && religionOf(cul) !== religionOf(owner);
}

// ---------------------------------------------------------------------------
// Birlik kurma
// ---------------------------------------------------------------------------
export function unionProgress(ctx: Ctx, tag: Tag, u: UnionDef): { owned: number; total: number } {
  let owned = 0;
  let total = 0;
  const members = new Set(u.members);
  for (let p = 0; p < ctx.w.P; p++) {
    if (!members.has(ctx.w.data.provinces[p].a3)) continue;
    total++;
    if (ctx.s.provinces[p].owner === tag && ctx.s.provinces[p].controller === tag) owned++;
  }
  return { owned, total };
}

export function canFormUnion(ctx: Ctx, tag: Tag, id: string): R {
  const u = UNIONS.find((x) => x.id === id);
  if (!u) return { ok: false, error: 'err.invalidTarget' };
  if (ctx.s.formed?.includes(id)) return { ok: false, error: 'union.alreadyFormed' };
  if (!u.members.includes(tag) && !u.members.includes(ctx.w.data.provinces[ctx.s.countries[tag]?.capital ?? -1]?.a3)) return { ok: false, error: 'union.notMember' };
  const { owned, total } = unionProgress(ctx, tag, u);
  if (total === 0 || owned / total < UNION_SHARE) return { ok: false, error: 'union.needMore' };
  return { ok: true };
}

export function formUnion(ctx: Ctx, tag: Tag, id: string): R {
  const s = ctx.s;
  const chk = canFormUnion(ctx, tag, id);
  if (!chk.ok) return chk;
  const u = UNIONS.find((x) => x.id === id)!;
  const c = s.countries[tag];
  const old = c.name;
  c.name = u.name.tr;
  c.nameEn = u.name.en;
  c.color = u.color;
  if (u.flag) c.flag = u.flag;
  const members = new Set(u.members);
  for (const p of provincesOf(ctx, tag)) {
    const ps = s.provinces[p];
    if (members.has(ctx.w.data.provinces[p].a3)) {
      if (!ps.cores.includes(tag)) ps.cores.push(tag);
      ps.culture = tag;
      delete ps.assimilating;
    }
  }
  c.stability = Math.min(100, c.stability + 10);
  (s.formed ??= []).push(id);
  s.versions.owners++;
  invalidateAll(ctx);
  notify(ctx, 'event', 'notif.unionFormed', { country: old, union: c.name }, { involves: [tag], global: true, severity: 'good', focus: { country: tag } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Başkent, adlar, bayrak ve renk
// ---------------------------------------------------------------------------
export function moveCapitalCost(ctx: Ctx, tag: Tag): number {
  return Math.max(0.05, ctx.s.countries[tag]?.budget.income ?? 0) * 6;
}

export function moveCapital(ctx: Ctx, tag: Tag, p: number): R {
  const s = ctx.s;
  const c = s.countries[tag];
  const ps = s.provinces[p];
  if (!c?.alive || !ps || ps.owner !== tag || ps.controller !== tag) return { ok: false, error: 'err.invalidTarget' };
  if (c.capital === p) return { ok: false, error: 'err.alreadyHave' };
  if (!ps.cores.includes(tag)) return { ok: false, error: 'capital.needsCore' };
  if (c.capitalMoved !== undefined && s.day - c.capitalMoved < 5 * 365) return { ok: false, error: 'err.cooldown' };
  const cost = moveCapitalCost(ctx, tag);
  if (c.treasury < cost) return { ok: false, error: 'err.noMoney' };
  c.treasury -= cost;
  c.capital = p;
  c.capitalMoved = s.day;
  c.stability = Math.max(0, c.stability - 3);
  s.versions.owners++;
  return { ok: true };
}

const clean = (v: string, n: number) => v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export function renameProvince(ctx: Ctx, tag: Tag, p: number, name: string): R {
  const s = ctx.s;
  if (s.provinces[p]?.owner !== tag) return { ok: false, error: 'err.invalidTarget' };
  const v = clean(name, 30);
  s.provinceNames ??= {};
  if (v) s.provinceNames[p] = v;
  else delete s.provinceNames[p];
  return { ok: true };
}

export function customizeCountry(ctx: Ctx, tag: Tag, opts: { name?: string; flag?: string; color?: [number, number, number] }): R {
  const s = ctx.s;
  const c = s.countries[tag];
  if (!c?.alive) return { ok: false, error: 'err.invalidTarget' };
  if (opts.name !== undefined) {
    const v = clean(opts.name, 40);
    if (v.length < 2) return { ok: false, error: 'err.invalidTarget' };
    c.name = v;
    c.nameEn = v;
  }
  if (opts.flag !== undefined) {
    if (!/^[a-z]{2}(-[a-z]{2,4})?$|^(eu|un|arab)$/.test(opts.flag)) return { ok: false, error: 'err.invalidTarget' };
    c.flag = opts.flag;
  }
  if (opts.color) {
    const col = opts.color.map((x) => Math.max(0, Math.min(255, Math.round(Number(x) || 0)))) as [number, number, number];
    c.color = col;
  }
  s.versions.owners++;
  invalidateAll(ctx);
  return { ok: true };
}
