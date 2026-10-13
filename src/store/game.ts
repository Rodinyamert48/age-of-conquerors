'use client';
/**
 * Arayüz ile simülasyon iş parçacığı arasındaki köprü.
 * Durum anlık görüntüleri iş parçacığından gelir; arayüz yalnızca komut göndererek durumu değiştirir.
 * Salt okunur sorgular (rota önizleme, muharebe tahmini, kabul olasılığı) en son anlık görüntü
 * üzerinde ana iş parçacığında hesaplanır.
 */
import { create } from 'zustand';
import type { CommandResult, GameState, GeoData, WorldData } from '@/game/types';
import { buildWorld, type World } from '@/game/world';
import { makeCtx, type Ctx } from '@/game/ctx';
import type { Command } from '@/game/commands';
import type { NewGameOptions } from '@/game/engine';
import type { FromWorker, ToWorker, Upcoming } from '@/worker/protocol';
import { writeSave, type SaveKind } from '@/lib/saves';
import { useSettings } from './settings';
import { dateFromDay } from '@/game/calendar';
import { playSound } from '@/lib/audio';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface GameStore {
  status: Status;
  loadingText: string;
  world: World | null;
  worldData: WorldData | null;
  geo: GeoData | null;
  state: GameState | null;
  upcoming: Upcoming[];
  playing: boolean;
  speed: number;
  turnMs: number;
  error: string | null;
  lastSaved: number | null;
  init: () => Promise<void>;
  newGame: (opts: NewGameOptions) => Promise<void>;
  loadState: (state: GameState) => Promise<void>;
  command: (cmd: Command) => Promise<CommandResult>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  step: () => void;
  save: (kind: SaveKind, name?: string) => Promise<void>;
  endGame: () => void;
  clearError: () => void;
}

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let pendingState: { resolve: () => void; reject: (e: Error) => void } | null = null;
const pendingCommands = new Map<number, (r: CommandResult) => void>();
let nextCmdId = 1;
let roCtx: { state: GameState; ctx: Ctx } | null = null;
let lastAutosaveKey = '';

function send(msg: ToWorker) {
  worker?.postMessage(msg);
}

/** En son anlık görüntü üzerinde salt okunur bağlam */
export function readCtx(): Ctx | null {
  const { world, state } = useGame.getState();
  if (!world || !state) return null;
  if (!roCtx || roCtx.state !== state) roCtx = { state, ctx: makeCtx(world, state) };
  return roCtx.ctx;
}

function autosaveKey(state: GameState): string | null {
  const freq = useSettings.getState().autosave;
  if (freq === 'off') return null;
  const { y, m } = dateFromDay(state.day);
  if (freq === 'monthly') return `${y}-${m}`;
  if (freq === 'quarterly') return `${y}-q${Math.floor((m - 1) / 3)}`;
  return `${y}`;
}

export const useGame = create<GameStore>()((set, get) => ({
  status: 'idle',
  loadingText: '',
  world: null,
  worldData: null,
  geo: null,
  state: null,
  upcoming: [],
  playing: false,
  speed: 2,
  turnMs: 0,
  error: null,
  lastSaved: null,

  init: async () => {
    if (readyPromise) return readyPromise;
    set({ status: 'loading', loadingText: 'loading.map' });
    readyPromise = (async () => {
      const [wRes, gRes] = await Promise.all([fetch('/data/world.json'), fetch('/data/world-geo.json')]);
      if (!wRes.ok || !gRes.ok) throw new Error('Harita verisi yüklenemedi');
      const worldData = (await wRes.json()) as WorldData;
      const geo = (await gRes.json()) as GeoData;
      const world = buildWorld(worldData);
      set({ loadingText: 'loading.engine' });
      worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
      await new Promise<void>((resolve, reject) => {
        const w = worker!;
        w.onmessage = (e: MessageEvent<FromWorker>) => {
          if (e.data.type === 'ready') {
            w.onmessage = onWorkerMessage;
            resolve();
          } else if (e.data.type === 'error') reject(new Error(e.data.message));
        };
        w.onerror = (ev) => reject(new Error(ev.message || 'Simülasyon başlatılamadı'));
        send({ type: 'init', world: worldData });
      });
      worker.onerror = (ev) => set({ error: ev.message || 'Simülasyon hatası', playing: false });
      set({ world, worldData, geo, status: 'ready', loadingText: '', speed: useSettings.getState().defaultSpeed });
      send({ type: 'speed', speed: get().speed });
    })().catch((e: unknown) => {
      readyPromise = null;
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      throw e;
    });
    return readyPromise;
  },

  newGame: async (opts) => {
    await get().init();
    lastAutosaveKey = '';
    await new Promise<void>((resolve, reject) => {
      pendingState = { resolve, reject };
      send({ type: 'new', options: opts });
    });
  },

  loadState: async (state) => {
    await get().init();
    lastAutosaveKey = autosaveKey(state) ?? '';
    await new Promise<void>((resolve, reject) => {
      pendingState = { resolve, reject };
      send({ type: 'load', state });
    });
  },

  command: (cmd) =>
    new Promise<CommandResult>((resolve) => {
      if (!worker) {
        resolve({ ok: false, error: 'err.noGame' });
        return;
      }
      const id = nextCmdId++;
      pendingCommands.set(id, resolve);
      send({ type: 'command', id, cmd });
    }),

  play: () => send({ type: 'play' }),
  pause: () => send({ type: 'pause' }),
  togglePlay: () => (get().playing ? get().pause() : get().play()),
  setSpeed: (speed) => {
    const sp = Math.max(1, Math.min(5, speed));
    set({ speed: sp });
    send({ type: 'speed', speed: sp });
  },
  step: () => {
    if (!get().playing) send({ type: 'step' });
  },
  save: async (kind, name) => {
    const st = get().state;
    if (!st) return;
    await writeSave(st, kind, name);
    set({ lastSaved: Date.now() });
  },
  endGame: () => {
    // Ana menüye dönerken son durum oturum kaydına yazılır ("devam et" için)
    writeSession();
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = null;
    send({ type: 'unload' });
    roCtx = null;
    set({ state: null, playing: false, upcoming: [] });
  },
  clearError: () => set({ error: null }),
}));

function onWorkerMessage(e: MessageEvent<FromWorker>) {
  const msg = e.data;
  const store = useGame.getState();
  switch (msg.type) {
    case 'state': {
      const prev = store.state;
      useGame.setState({ state: msg.state, upcoming: msg.upcoming, playing: msg.playing, turnMs: msg.turnMs });
      if (pendingState && (msg.reason === 'new' || msg.reason === 'load')) {
        pendingState.resolve();
        pendingState = null;
      }
      // Yeni bildirimler için ses
      if (prev && msg.reason === 'turn') {
        const lastId = prev.nextNotificationId;
        const fresh = msg.state.notifications.filter((n) => n.id >= lastId && n.player);
        if (fresh.some((n) => n.severity === 'critical' || n.kind === 'war')) playSound('war');
        else if (fresh.some((n) => n.kind === 'battle')) playSound('battle');
        else if (fresh.length) playSound('notify');
      }
      scheduleSessionSave();
      // Otomatik kayıt
      if (msg.reason === 'turn') {
        const key = autosaveKey(msg.state);
        if (key && key !== lastAutosaveKey) {
          if (lastAutosaveKey) {
            writeSave(msg.state, 'auto', undefined)
              .then(() => useGame.setState({ lastSaved: Date.now() }))
              .catch((err: unknown) => useGame.setState({ error: `Otomatik kayıt başarısız: ${err instanceof Error ? err.message : String(err)}` }));
          }
          lastAutosaveKey = key;
        }
      }
      break;
    }
    case 'commandResult': {
      const r = pendingCommands.get(msg.id);
      pendingCommands.delete(msg.id);
      r?.(msg.result);
      break;
    }
    case 'error':
      if (pendingState) {
        pendingState.reject(new Error(msg.message));
        pendingState = null;
      }
      useGame.setState({ error: msg.message, playing: false });
      break;
    default:
      break;
  }
}

/**
 * Oturum kaydı: sayfa yenilendiğinde ya da sekme kapandığında ilerleme kaybolmaz.
 * Duraklatılmışken her değişiklikten kısa süre sonra, oynarken en fazla 10 saniyede bir yazılır.
 * (Sayfa kapanırken başlatılan IndexedDB yazımı tamamlanmayabileceğinden yalnızca ona güvenilmez.)
 */
const SESSION_PLAYING_MS = 10_000;
const SESSION_IDLE_MS = 600;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;
let sessionWrittenFor: GameState | null = null;
let lastSessionWrite = 0;

function writeSession(): void {
  const st = useGame.getState().state;
  if (!st || st === sessionWrittenFor) return;
  sessionWrittenFor = st;
  lastSessionWrite = Date.now();
  writeSave(st, 'session', 'Son oturum').catch(() => {});
}

function scheduleSessionSave(): void {
  const { playing } = useGame.getState();
  if (sessionTimer) {
    if (playing) return; // oynarken zamanlayıcı sürer
    clearTimeout(sessionTimer);
  }
  const delay = playing ? Math.max(SESSION_IDLE_MS, SESSION_PLAYING_MS - (Date.now() - lastSessionWrite)) : SESSION_IDLE_MS;
  sessionTimer = setTimeout(() => {
    sessionTimer = null;
    writeSession();
  }, delay);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeSession();
  });
  window.addEventListener('pagehide', writeSession);
}
