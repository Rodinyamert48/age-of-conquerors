import type { CommandResult, GameState, WorldData } from '@/game/types';
import type { NewGameOptions } from '@/game/engine';
import type { Command } from '@/game/commands';

export interface Upcoming {
  kind: string;
  key: string;
  params: Record<string, string | number>;
  days: number;
}

export type ToWorker =
  | { type: 'init'; world: WorldData }
  | { type: 'new'; options: NewGameOptions }
  | { type: 'load'; state: GameState }
  | { type: 'command'; id: number; cmd: Command }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; speed: number }
  | { type: 'step' }
  | { type: 'unload' };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'state'; state: GameState; upcoming: Upcoming[]; playing: boolean; reason: 'new' | 'load' | 'turn' | 'command'; turnMs: number }
  | { type: 'commandResult'; id: number; result: CommandResult }
  | { type: 'error'; message: string; fatal?: boolean };

/** Hız → turlar arası hedef gecikme (ms) */
export const SPEED_DELAYS = [0, 1000, 450, 180, 70, 0];
