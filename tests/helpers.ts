import fs from 'node:fs';
import path from 'node:path';
import type { WorldData } from '@/game/types';
import { buildWorld, type World } from '@/game/world';
import { createGame, type NewGameOptions } from '@/game/engine';

let cached: World | null = null;

export function loadWorld(): World {
  if (!cached) {
    const raw = fs.readFileSync(path.resolve(__dirname, '../public/data/world.json'), 'utf8');
    cached = buildWorld(JSON.parse(raw) as WorldData);
  }
  return cached;
}

export function newModernGame(opts: Partial<NewGameOptions> = {}) {
  const world = loadWorld();
  return createGame(world, {
    scenarioId: 'modern',
    player: 'TUR',
    difficulty: 'normal',
    timeStep: 'day',
    victory: { mode: 'sandbox', target: 0 },
    seed: 42,
    // Eski testler 2020 ittifak düzenine dayanır; nötr başlangıç ayrıca test edilir
    rules: { neutralStart: false },
    ...opts,
  });
}

export function provinceByName(world: World, a3: string, name: string): number {
  const i = world.data.provinces.findIndex((p) => p.a3 === a3 && p.name === name);
  if (i < 0) throw new Error(`Bölge bulunamadı: ${a3}/${name}`);
  return i;
}
