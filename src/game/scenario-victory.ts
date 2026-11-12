/**
 * Senaryoya özgü zafer koşulları. Her işlev 0..1 ilerleme döndürür.
 */
import type { Ctx } from './ctx';
import { provincesOf } from './ctx';

type VictoryFn = (ctx: Ctx) => number;

const registry: Record<string, VictoryFn> = {
  /** Modern: başlangıç bölge sayısını iki katına çıkar ve en büyük üç ekonomiden biri ol */
  modern: (ctx) => {
    const { s } = ctx;
    if (!s.countries[s.player]?.alive) return 0;
    const provinces = provincesOf(ctx, s.player).length;
    const provRatio = provinces / Math.max(1, s.meta.playerStartProvinces * 2);
    const outputs = new Map<string, number>();
    for (const ps of s.provinces) outputs.set(ps.owner, (outputs.get(ps.owner) ?? 0) + ps.output);
    const mine = outputs.get(s.player) ?? 0;
    const sorted = [...outputs.entries()].filter(([t]) => t !== s.player).map(([, v]) => v).sort((a, b) => b - a);
    const third = sorted[2] ?? 0;
    const econ = mine >= third ? 1 : mine / Math.max(1e-9, third);
    return Math.min(1, Math.min(provRatio, econ));
  },
};

export function getScenarioVictory(id: string): VictoryFn | undefined {
  return registry[id];
}

export function registerScenarioVictory(id: string, fn: VictoryFn): void {
  registry[id] = fn;
}
