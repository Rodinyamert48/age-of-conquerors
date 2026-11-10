/// <reference lib="webworker" />
/**
 * Simülasyon iş parçacığı: oyun durumunun sahibi. Turları işler, komutları uygular ve
 * arayüze durum anlık görüntüleri gönderir. Oyun duraklatıldığında hiçbir sistem ilerlemez.
 */
import { buildWorld, type World } from '@/game/world';
import { advanceTurn, createGame, upcoming } from '@/game/engine';
import { makeCtx, type Ctx } from '@/game/ctx';
import { runCommand } from '@/game/commands';
import { computeAllBudgets } from '@/game/economy';
import { SPEED_DELAYS, type FromWorker, type ToWorker } from './protocol';
import { writeSave } from '@/lib/saves';

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
let ctx: Ctx | null = null;
let playing = false;
let speed = 2;
let timer: ReturnType<typeof setTimeout> | null = null;
let processing = false;
let lastPost = 0;
let lastTurnMs = 0;
const POST_INTERVAL_MS = 240;

function post(msg: FromWorker) {
  self.postMessage(msg);
}

function postState(reason: 'new' | 'load' | 'turn' | 'command') {
  if (!ctx) return;
  lastPost = performance.now();
  post({ type: 'state', state: ctx.s, upcoming: upcoming(ctx), playing, reason, turnMs: lastTurnMs });
}

function stopLoop() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(delay: number) {
  stopLoop();
  timer = setTimeout(tick, Math.max(0, delay));
}

function tick() {
  timer = null;
  if (!playing || !ctx || processing) return;
  processing = true;
  const t0 = performance.now();
  try {
    advanceTurn(ctx);
  } catch (e) {
    playing = false;
    processing = false;
    post({ type: 'error', message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
    postState('turn');
    return;
  }
  lastTurnMs = performance.now() - t0;
  processing = false;
  if (ctx.s.gameOver && !ctx.s.gameOver.acknowledged) playing = false;
  const now = performance.now();
  // Tam durumun kopyalanması pahalıdır (~1,5 MB): oynarken arayüze saniyede en çok ~4 güncelleme gönderilir
  if (!playing || now - lastPost >= POST_INTERVAL_MS) postState('turn');
  if (playing) schedule(SPEED_DELAYS[speed] - (performance.now() - t0));
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'init':
        world = buildWorld(msg.world);
        post({ type: 'ready' });
        break;
      case 'new':
        if (!world) throw new Error('Dünya verisi yüklenmedi');
        playing = false;
        stopLoop();
        ctx = createGame(world, msg.options);
        postState('new');
        break;
      case 'load':
        if (!world) throw new Error('Dünya verisi yüklenmedi');
        playing = false;
        stopLoop();
        ctx = makeCtx(world, msg.state);
        computeAllBudgets(ctx);
        postState('load');
        break;
      case 'command': {
        if (!ctx) throw new Error('Etkin oyun yok');
        const result = runCommand(ctx, msg.cmd);
        post({ type: 'commandResult', id: msg.id, result });
        postState('command');
        break;
      }
      case 'play':
        if (!ctx || (ctx.s.gameOver && !ctx.s.gameOver.acknowledged)) return;
        if (!playing) {
          playing = true;
          schedule(0);
          postState('command');
        }
        break;
      case 'pause':
        playing = false;
        stopLoop();
        postState('command');
        break;
      case 'speed':
        speed = Math.max(1, Math.min(5, Math.round(msg.speed)));
        if (playing) schedule(SPEED_DELAYS[speed]);
        break;
      case 'step':
        if (!ctx) return;
        // Arayüz yanıt bekliyor: tur işlenemese de güncel durumu gönder
        if (playing || processing) {
          postState('turn');
          return;
        }
        processing = true;
        {
          const t0 = performance.now();
          advanceTurn(ctx);
          lastTurnMs = performance.now() - t0;
        }
        processing = false;
        postState('turn');
        break;
      case 'save': {
        const { id, kind, name } = msg;
        if (!ctx) {
          post({ type: 'saved', id, error: 'Etkin oyun yok' });
          break;
        }
        writeSave(ctx.s, kind, name)
          .then(() => post({ type: 'saved', id }))
          .catch((err: unknown) => post({ type: 'saved', id, error: err instanceof Error ? err.message : String(err) }));
        break;
      }
      case 'unload':
        playing = false;
        stopLoop();
        ctx = null;
        break;
    }
  } catch (err) {
    processing = false;
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
