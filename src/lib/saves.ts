/**
 * Kayıt yuvaları: otomatik kayıt (döngüsel 3 yuva), hızlı kayıt, oturum kaydı ve adlandırılmış manuel kayıtlar.
 */
import type { GameState } from '@/game/types';
import { deserialize, serializeState, SaveError } from '@/game/save';
import { SAVE_VERSION } from '@/game/engine';
import { DATA_STORE, META_STORE, idbDeletePair, idbGet, idbGetAll, idbPutPair } from './idb';

export type SaveKind = 'auto' | 'manual' | 'quick' | 'session';

export interface SaveMeta {
  id: string;
  name: string;
  kind: SaveKind;
  savedAt: number;
  version: number;
  scenarioId: string;
  scenarioName: string;
  day: number;
  turn: number;
  player: string;
  playerName: string;
  playerFlag: string;
  provinces: number;
}

interface SaveData {
  id: string;
  envelope: ReturnType<typeof serializeState>;
}

const AUTO_SLOTS = 3;

function metaOf(id: string, name: string, kind: SaveKind, state: GameState): SaveMeta {
  const c = state.countries[state.player];
  let provinces = 0;
  for (const p of state.provinces) if (p.owner === state.player) provinces++;
  return {
    id,
    name,
    kind,
    savedAt: Date.now(),
    version: SAVE_VERSION,
    scenarioId: state.meta.scenarioId,
    scenarioName: state.meta.scenarioName,
    day: state.day,
    turn: state.turn,
    player: state.player,
    playerName: c?.name ?? state.player,
    playerFlag: c?.flag ?? '',
    provinces,
  };
}

export async function writeSave(state: GameState, kind: SaveKind, name?: string, id?: string): Promise<SaveMeta> {
  let saveId = id;
  if (!saveId) {
    if (kind === 'quick') saveId = 'quick';
    else if (kind === 'session') saveId = 'session';
    else if (kind === 'auto') {
      const metas = await listSaves();
      const autos = metas.filter((m) => m.kind === 'auto').sort((a, b) => a.savedAt - b.savedAt);
      const used = new Set(autos.map((m) => m.id));
      let slot = '';
      for (let i = 1; i <= AUTO_SLOTS; i++) if (!used.has(`auto-${i}`)) {
        slot = `auto-${i}`;
        break;
      }
      saveId = slot || autos[0].id; // en eski otomatik kaydın üzerine yaz
    } else saveId = `manual-${Date.now().toString(36)}`;
  }
  const meta = metaOf(saveId, name ?? saveId, kind, state);
  const data: SaveData = { id: saveId, envelope: serializeState(state) };
  await idbPutPair(meta, data);
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const metas = await idbGetAll<SaveMeta>(META_STORE);
  return metas.sort((a, b) => b.savedAt - a.savedAt);
}

export async function readSave(id: string, provinceCount?: number): Promise<GameState> {
  const data = await idbGet<SaveData>(DATA_STORE, id);
  if (!data) throw new SaveError('corrupt', 'Kayıt bulunamadı');
  return deserialize(data.envelope, provinceCount);
}

export async function deleteSave(id: string): Promise<void> {
  await idbDeletePair(id);
}

export async function latestSave(): Promise<SaveMeta | undefined> {
  const list = await listSaves();
  return list[0];
}

export function exportSaveFile(state: GameState, fileName: string): void {
  const blob = new Blob([JSON.stringify(serializeState(state))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importSaveFile(file: File, provinceCount?: number): Promise<GameState> {
  const text = await file.text();
  return deserialize(text, provinceCount);
}
