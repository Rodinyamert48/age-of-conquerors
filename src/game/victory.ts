/**
 * Zafer ve yenilgi koşulları.
 */
import type { GameState } from './types';
import { allianceOf, provincesOf, type Ctx } from './ctx';
import { REBEL_TAG } from './query';
import { getScenarioVictory } from './scenario-victory';

export interface VictoryProgress {
  mode: GameState['rules']['victory']['mode'];
  /** 0..1 */
  progress: number;
  current: number;
  target: number;
}

export function victoryProgress(ctx: Ctx): VictoryProgress {
  const { s, w } = ctx;
  const v = s.rules.victory;
  const tag = s.player;
  const total = w.P;
  switch (v.mode) {
    case 'domination': {
      const mine = provincesOf(ctx, tag).length;
      const target = Math.ceil((total * v.target) / 100);
      return { mode: v.mode, progress: mine / target, current: mine, target };
    }
    case 'provinces': {
      const mine = provincesOf(ctx, tag).length;
      return { mode: v.mode, progress: mine / v.target, current: mine, target: v.target };
    }
    case 'economic': {
      let world = 0;
      let mine = 0;
      for (const ps of s.provinces) {
        if (ps.owner === REBEL_TAG) continue;
        world += ps.output;
        if (ps.owner === tag) mine += ps.output;
      }
      const share = world > 0 ? (mine / world) * 100 : 0;
      return { mode: v.mode, progress: share / v.target, current: Math.round(share * 10) / 10, target: v.target };
    }
    case 'alliance': {
      const al = allianceOf(ctx, tag);
      if (!al || al.leader !== tag) return { mode: v.mode, progress: 0, current: 0, target: v.target };
      let n = 0;
      for (const m of al.members) n += provincesOf(ctx, m).length;
      const share = (n / total) * 100;
      return { mode: v.mode, progress: share / v.target, current: Math.round(share * 10) / 10, target: v.target };
    }
    case 'scenario': {
      const fn = getScenarioVictory(s.meta.scenarioId);
      if (!fn) return { mode: v.mode, progress: 0, current: 0, target: 1 };
      const p = fn(ctx);
      return { mode: v.mode, progress: p, current: Math.round(p * 100), target: 100 };
    }
    default:
      return { mode: 'sandbox', progress: 0, current: 0, target: 0 };
  }
}

export function victoryTick(ctx: Ctx): void {
  const s = ctx.s;
  const pc = s.countries[s.player];
  if (s.gameOver && !s.gameOver.acknowledged) return;
  if (!pc || !pc.alive) {
    if (!s.gameOver || s.gameOver.result !== 'defeat') {
      s.gameOver = { result: 'defeat', reason: 'gameover.eliminated', day: s.day, acknowledged: false };
    }
    return;
  }
  if (s.gameOver) return; // zafer onaylandıktan sonra serbest oyun
  if (s.rules.victory.mode === 'sandbox') return;
  const vp = victoryProgress(ctx);
  if (vp.progress >= 1) {
    s.gameOver = { result: 'victory', reason: `victory.${vp.mode}`, day: s.day, acknowledged: false };
  }
}
