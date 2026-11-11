/**
 * Yapay zekâ: vergi ve politika ayarı, bina yatırımları, araştırma seçimi.
 * Kararlar denetlenebilir kurallara dayanır: önce mali sağlık, sonra yatırım getirisi.
 */
import type { BuildingId, Country } from '../types';
import { BUILDING_IDS } from '../types';
import { getMods, provincesOf, type Ctx } from '../ctx';
import { buildingAvailability, startConstruction, availableTechs } from '../construction';
import { TECH_BY_ID } from '../defs/techs';
import { TAX_RATES } from '../defs/policies';
import { isAtWar, REBEL_TAG } from '../query';
import { biggestThreat } from '../diplomacy';
import { taxEfficiency, B_FORT } from '../economy';
import { random } from '../rng';

const FOCUS_BRANCHES: Record<Country['ai']['focus'], string[]> = {
  economy: ['economy', 'agriculture', 'infrastructure', 'administration'],
  military: ['land', 'artillery', 'logistics', 'naval'],
  balanced: ['economy', 'land', 'agriculture', 'administration', 'artillery', 'infrastructure', 'logistics', 'diplomacy', 'naval'],
};

export function aiResearch(ctx: Ctx, c: Country): void {
  if (c.research.current) return;
  const avail = availableTechs(ctx, c.tag);
  if (!avail.length) return;
  const prefer = FOCUS_BRANCHES[c.ai.focus];
  let best = avail[0];
  let bestScore = -Infinity;
  for (const id of avail) {
    const t = TECH_BY_ID[id];
    const pi = prefer.indexOf(t.branch);
    const score = -t.year + (pi >= 0 ? 40 - pi * 4 : 0) + (isAtWar(ctx, c.tag) && ['land', 'artillery', 'logistics'].includes(t.branch) ? 25 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  c.research.current = best;
}

export function aiPolicies(ctx: Ctx, c: Country): void {
  const s = ctx.s;
  const b = c.budget;
  const income = Math.max(1e-6, b.income);
  const war = isAtWar(ctx, c.tag);
  const p = c.policies;
  const months = c.treasury / income;
  // Vergi
  if ((b.balance < 0 || months < 1) && c.stability > 45 && p.tax < 3) p.tax++;
  else if (c.stability < 32 && p.tax > 1) p.tax--;
  else if (months > 18 && c.stability < 65 && p.tax > 1) p.tax--;
  else if (months > 36 && p.tax > 1 && b.balance > income * 0.15) p.tax--;
  // Askerî bütçe
  const wantMil = war ? 3 : months < 0 ? 1 : 2;
  if (p.military !== wantMil) p.military = wantMil;
  // Güvenlik
  let maxUnrest = 0;
  for (const pr of provincesOf(ctx, c.tag)) maxUnrest = Math.max(maxUnrest, s.provinces[pr].unrest);
  const wantSec = maxUnrest > 55 ? 3 : maxUnrest > 35 ? 2 : 1;
  if (p.security < wantSec && months > 0) p.security++;
  else if (p.security > wantSec) p.security--;
  // Kamu harcamaları
  if (c.stability < 40 && months > 1 && p.welfare < 3) p.welfare++;
  else if (months < 0 && p.welfare > 1) p.welfare--;
  // Yatırım politikaları: hazine sağlıklıysa yükselt, açıktaysa kıs
  const invest: ('education' | 'infrastructure' | 'development')[] = ['development', 'education', 'infrastructure'];
  if (months < 0 || b.balance < 0) {
    for (const k of invest) if (p[k] > 0 && b.balance < 0) {
      p[k]--;
      break;
    }
  } else if (months > 6 && b.balance > income * 0.1) {
    const k = invest[Math.floor(random(s) * invest.length)];
    const cap = months > 24 ? 4 : c.ai.focus === 'economy' ? 3 : 2;
    if (p[k] < cap) p[k]++;
    if (months > 24 && p.welfare < 4 && c.stability < 75) p.welfare++;
  }
}

function buildingValue(ctx: Ctx, c: Country, p: number, id: BuildingId, threatBorder: Set<number>): number {
  const s = ctx.s;
  const ps = s.provinces[p];
  const rate = TAX_RATES[c.policies.tax] ?? 0.22;
  const eff = taxEfficiency(ctx, c.tag);
  const out = ps.output;
  const mods = getMods(ctx, c.tag);
  switch (id) {
    case 'industry':
      return (out * (0.06 * rate * eff + 0.006 * (1 + mods.productionIncome))) / 12;
    case 'agriculture':
      return (out * 0.03 * rate * eff) / 12 + (c.resources.shortage.food || c.resources.imported.food > 0 ? (s.meta.avgProvinceOutput * 0.004) : 0);
    case 'trade':
      return (out * 0.006 * (1 + mods.tradeIncome)) / 12;
    case 'port':
      return (out * 0.004) / 12 + (ps.buildings[3] === 0 && p === c.capital ? s.meta.avgProvinceOutput * 0.002 : 0);
    case 'road':
      return (out * 0.02 * rate * eff) / 12;
    case 'university':
      return (s.meta.avgProvinceOutput * 0.0025) * (c.ai.focus === 'economy' ? 1.3 : 1);
    case 'military':
      return c.ai.focus === 'military' ? s.meta.avgProvinceOutput * 0.0015 : s.meta.avgProvinceOutput * 0.0006;
    case 'fort':
      return threatBorder.has(p) && ps.buildings[B_FORT] < 2 ? s.meta.avgProvinceOutput * 0.003 : 0;
  }
}

export function aiBuild(ctx: Ctx, c: Country, maxProjects: number): void {
  const s = ctx.s;
  const income = Math.max(1e-6, c.budget.income);
  if (c.treasury < income * 2 || c.budget.balance < 0) return;
  const provs = provincesOf(ctx, c.tag)
    .filter((p) => s.provinces[p].controller === c.tag && !s.provinces[p].construction)
    .sort((a, b) => s.provinces[b].output - s.provinces[a].output)
    .slice(0, 30);
  if (!provs.length) return;
  // Tehdit sınırı
  const threat = biggestThreat(ctx, c.tag);
  const border = new Set<number>();
  if (threat && threat.ratio > 0.8) {
    for (const p of provincesOf(ctx, c.tag)) {
      const wp = ctx.w.data.provinces[p];
      if (wp.adj.some((j) => s.provinces[j].owner === threat.tag)) border.add(p);
    }
  }
  const cands: { p: number; id: BuildingId; roi: number; cost: number }[] = [];
  for (const p of [...provs, ...[...border].slice(0, 4)]) {
    for (const id of BUILDING_IDS) {
      const av = buildingAvailability(ctx, c.tag, p, id);
      if (!av.ok) continue;
      const v = buildingValue(ctx, c, p, id, border);
      if (v <= 0) continue;
      cands.push({ p, id, roi: v / Math.max(1e-6, av.cost), cost: av.cost });
    }
  }
  cands.sort((a, b) => b.roi - a.roi);
  let built = 0;
  const used = new Set<number>();
  for (const cand of cands) {
    if (built >= maxProjects) break;
    if (used.has(cand.p)) continue;
    if (c.treasury - cand.cost < income * 1.5) continue;
    // Geri dönüş süresi çok uzunsa (≥ 25 yıl) yatırım yapma
    if (cand.roi < 1 / 300) continue;
    const r = startConstruction(ctx, c.tag, cand.p, cand.id);
    if (r.ok) {
      built++;
      used.add(cand.p);
    }
  }
}

export function aiEconomy(ctx: Ctx, c: Country): void {
  if (c.tag === REBEL_TAG || c.rebelMovement) return;
  aiPolicies(ctx, c);
  aiResearch(ctx, c);
  const n = provincesOf(ctx, c.tag).length;
  const months = c.treasury / Math.max(1e-6, c.budget.income);
  const projects = Math.max(1, Math.min(10, Math.round(n / 12) + (months > 12 ? 3 : 0) + (months > 36 ? 4 : 0)));
  aiBuild(ctx, c, projects);
}
